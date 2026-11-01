import { sceneReachableTiles, type DayScene, type Tile, type WorldObject } from "../lib/day";
import { actorById, actorSprite } from "../lib/actor-library";
import type { WorldDesign } from "../pipeline/world-design";
import type { SceneBlueprint } from "../pipeline/scene-types";
import { TILE } from "./maps";
import { applyGround, expandFeatures, type Composition } from "./composition";
import { TEMPLATES, WORLD_COLS, WORLD_ROWS, defaultTemplateFor, type LayoutTemplate, type Zone } from "./layout-templates";

export { WORLD_COLS, WORLD_ROWS };
export const LIBRARY = "/tiles/dq/library/";
const furniture: Record<string, { width: number; height: number; depth: number }> = {
  tree: { width: 53, height: 60, depth: 9 }, lamp: { width: 15, height: 58, depth: 6 },
  bollard: { width: 10, height: 20, depth: 5 }, cycle_stand: { width: 26, height: 28, depth: 8 },
  aboard: { width: 21, height: 28, depth: 8 }, hedge: { width: 55, height: 20, depth: 9 },
  bin_grey: { width: 18, height: 26, depth: 8 }, bin_purple: { width: 18, height: 26, depth: 8 }, car_blue: { width: 55, height: 34, depth: 12 }, car_red: { width: 59, height: 34, depth: 12 },
};

/** The street's zones, kept for callers that predate templates. Prefer zonesFor(blueprint). */
export const WORLD_ZONES = TEMPLATES.street.zones;
const BUILDING_X = [112, 320, 528];
export const templateFor = (blueprint: Pick<SceneBlueprint, "ground" | "template">): LayoutTemplate => TEMPLATES[blueprint.template ?? defaultTemplateFor(blueprint.ground)];
export const zonesFor = (blueprint: Pick<SceneBlueprint, "ground" | "template">): Zone[] => templateFor(blueprint).zones;
/** Where each building (or scenic feature) stands and where people would approach it from. */
export const buildingAnchors = (blueprint: SceneBlueprint) =>
  blueprint.buildings.slice(0, 3).map((b, i) => ({ id: b.id, name: b.name, x: BUILDING_X[i], y: 160, front: { x: BUILDING_X[i], y: 190 } }));

/** Stable walkable composition built from the chosen location template. Asset generation never decides collision geometry. */
export function buildWorldLayout(blueprint: SceneBlueprint, sprites: Record<string, string>) {
  const template = templateFor(blueprint);
  const skeleton = Array.from({ length: WORLD_ROWS }, (_, y) => Array.from({ length: WORLD_COLS }, (_, x) => template.ground(x, y)).join(""));
  const composition: Composition = blueprint.composition ?? template.defaults;
  const ground = applyGround(skeleton, composition.ground);
  const objects: WorldObject[] = blueprint.buildings.slice(0, 3).map((building, i) => {
    const x = BUILDING_X[i], y = 160;
    const sprite = sprites[building.id];
    if (!sprite) throw new Error(`Missing sprite for ${building.id}`);
    return { id: building.id, name: building.name, text: building.description, sprite,
      x, y, width: 160, height: 128, collision: { x: x - 72, y: y - 25, width: 144, height: 25 } };
  });
  // A water operation may surround a photographed building, but cannot flood its physical foundation.
  for (const object of objects) {
    const box = object.collision!;
    for (let row = Math.floor(box.y / TILE); row <= Math.floor((box.y + box.height - 1) / TILE); row++) {
      const cells = ground[row].split("");
      for (let col = Math.floor(box.x / TILE); col <= Math.floor((box.x + box.width - 1) / TILE); col++) if (cells[col] === "w") cells[col] = skeleton[row][col];
      ground[row] = cells.join("");
    }
  }
  const world = { width: WORLD_COLS, height: WORLD_ROWS, ground, objects, ...(template.crossing ? { crossing: template.crossing } : {}) } satisfies NonNullable<DayScene["world"]>;
  const spawn = { ...template.spawn }, exit = { ...template.exit };
  let foodTile = { ...template.foodTile };
  const wet = (px: number, py: number) => [py, py - 8].some((y) => world.ground[Math.floor(y / TILE)]?.[Math.floor(px / TILE)] === "w");
  /** Adds furniture at the first candidate spot that is dry, on the map and leaves the exit reachable. Returns whether it was placed. */
  function prop(id: string, name: string, kind: string, spots: [number, number][], text?: string, sprite?: string): boolean {
    const spec = sprite ? { width: 32, height: 48, depth: 8 } : furniture[kind] ?? { width: 32, height: 40, depth: 8 };
    for (const [x, y] of spots) {
      if (x - spec.width / 2 < 0 || x + spec.width / 2 > WORLD_COLS * TILE || y - spec.height < 0 || y > WORLD_ROWS * TILE || wet(x, y)) continue;
      const object: WorldObject = { id, name, sprite: sprite ?? `${LIBRARY}${kind}.png`, x, y, width: spec.width, height: spec.height,
        collision: { x: x - Math.floor(Math.min(spec.width - 4, 28) / 2), y: y - spec.depth, width: Math.min(spec.width - 4, 28), height: spec.depth }, text };
      const box = object.collision!;
      if (objects.some(other => other.collision && box.x < other.collision.x + other.collision.width && box.x + box.width > other.collision.x &&
        box.y < other.collision.y + other.collision.height && box.y + box.height > other.collision.y)) continue;
      const trial = { ...world, objects: [...objects, object] };
      if (worldCollision(trial, tileFeet(spawn).x, tileFeet(spawn).y) || worldCollision(trial, tileFeet(exit).x, tileFeet(exit).y) || !exitReachable(trial, spawn, exit)) continue;
      objects.push(object);
      return true;
    }
    return false;
  }
  // Furniture frames the route rather than crossing it. All entrance approaches remain clear.
  const lampName = template.id === "street" ? "Street light" : "Lamp post";
  template.lamps.slice(0, 4).forEach(([x, y], i) => prop(`street_lamp_${i}`, lampName, "lamp", [[x, y]]));
  template.trees.slice(0, 4).forEach(([x, y], i) => prop(`verge_tree_${i}`, "Neighbourhood tree", "tree", [[x, y]]));
  if (template.id === "street") {
    prop("parked_car", "Parked car", "car_red", [template.fixed[0].slice(1) as [number, number]]);
    prop("bike_rack", "Cycle stand", "cycle_stand", [template.fixed[1].slice(1) as [number, number]]);
    prop("street_bin", "Recycling bin", "bin_grey", [template.fixed[2].slice(1) as [number, number]]);
    prop("cafe_board", "A little lunch spot", "aboard", [template.fixed[3].slice(1) as [number, number]], blueprint.food?.text ?? "A good place to pause and watch the street.");
  } else {
    // Other templates have no road furniture; a small sign marks the lunch spot instead.
    const [fx, fy] = [template.foodTile.x * TILE + 8 - 26, template.foodTile.y * TILE + 30];
    prop("cafe_board", "A little lunch spot", "aboard", [[fx, fy], [fx + 52, fy]], blueprint.food?.text ?? "A good place to pause and look around.");
  }
  // Scenery from the composition: rows and groves of trees, hedges and lamps. Any that cannot stand safely are skipped.
  expandFeatures(composition.features).forEach((f, i) => prop(`kit_${f.kind}_${i}`, f.kind === "tree" ? "Tree" : f.kind === "hedge" ? "Hedge" : "Street furniture", f.kind, [[f.x * TILE + 8, f.y * TILE + 15]]));
  blueprint.props.slice(0, 6).forEach((item, i) => {
    if (item.library && !furniture[item.library]) throw new Error(`Unknown furniture library asset: ${item.library}`);
    if (!item.library && !sprites[item.id]) throw new Error(`Missing sprite for ${item.id}`);
    // The slot for this prop first, then any other free slot, so one blocked spot never loses a photographed object.
    const spots = [template.propSlots[i], ...template.propSlots.filter((_, j) => j !== i)];
    if (!item.library) {
      // Required photographed objects get additional deterministic dry candidates, never substitute library artwork.
      const extra: [number, number][] = [];
      for (let y = 11; y < WORLD_ROWS; y++) for (let x = 1; x < WORLD_COLS - 1; x++) extra.push([x * TILE + 8, y * TILE + 15]);
      const preferred = template.propSlots[i];
      extra.sort((a, b) => Math.hypot(a[0] - preferred[0], a[1] - preferred[1]) - Math.hypot(b[0] - preferred[0], b[1] - preferred[1]));
      spots.push(...extra);
    }
    const placed = prop(item.id, item.name, item.library ?? "custom", spots, item.description, sprites[item.id]);
    if (!placed && !item.library) throw new Error(`No safe placement for photographed object ${item.id}`);
  });
  const foodBox = (tile: Tile): WorldObject => ({ id: "__meal_placement", name: "Meal table", sprite: "food.png", x: tile.x * TILE + 8, y: tile.y * TILE + 16,
    width: 16, height: 10, collision: { x: tile.x * TILE, y: tile.y * TILE + 6, width: 16, height: 10 } });
  if (blueprint.food) {
    const scene: DayScene = { kind: "tourist", title: blueprint.title, time: blueprint.time, base: "street", world, spawn, exit, landmarks: [] };
    const reached = sceneReachableTiles(scene);
    const candidates = [...reached].map(key => { const [x, y] = key.split(",").map(Number); return { x, y }; })
      .sort((a, b) => Math.abs(a.x - foodTile.x) + Math.abs(a.y - foodTile.y) - Math.abs(b.x - foodTile.x) - Math.abs(b.y - foodTile.y));
    const safe = candidates.find(tile => {
      if (Math.abs(tile.x - spawn.x) + Math.abs(tile.y - spawn.y) < 2 || Math.abs(tile.x - exit.x) + Math.abs(tile.y - exit.y) < 2) return false;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reached.has(`${tile.x + dx},${tile.y + dy}`))) return false;
      const trial = { ...world, objects: [...objects, foodBox(tile)] };
      return exitReachable(trial, spawn, exit);
    });
    if (!safe) throw new Error("No safe dry placement for the photographed meal");
    foodTile = safe;
  }
  // The temporary food footprint protects lunch while placing supporting actors; it is never published as a sprite.
  const placementWorld = blueprint.food ? { ...world, objects: [...objects, foodBox(foodTile)] } : world;
  const placed = blueprint.design ? placeDesign(placementWorld, spawn, exit, blueprint.design, sprites, blueprint.food ? foodTile : undefined, buildingAnchors(blueprint), template.zones) : [];
  world.objects.push(...placed);
  return { world, spawn, exit, foodTile };
}

const STEP = 8;
/** Lattice cells the player can stand on, flooding outwards from `from`. */
export function reachableCells(world: NonNullable<DayScene["world"]>, from: { x: number; y: number }): Set<string> {
  if (worldCollision(world, from.x, from.y)) return new Set<string>();
  const seen = new Set<string>([`${from.x},${from.y}`]), queue = [from];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (!seen.has(key) && [0.25, 0.5, 0.75, 1].every(t => !worldCollision(world, x + dx * t, y + dy * t))) { seen.add(key); queue.push({ x: nx, y: ny }); }
    }
  }
  return seen;
}
/** The renderer ends a chapter when the feet are within 12 px of the exit's x and 22 px of its y. */
export function exitReachable(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile): boolean {
  const start = tileFeet(spawn), target = tileFeet(exit);
  const cells = reachableCells(world, { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP });
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    if (Math.abs(x - target.x) < 12 && Math.abs(y - target.y) < 22) return true;
  }
  return false;
}
const rectDistance = (px: number, py: number, box: { x: number; y: number; width: number; height: number }) =>
  Math.hypot(Math.max(box.x - px, 0, px - (box.x + box.width)), Math.max(box.y - py, 0, py - (box.y + box.height)));

/**
 * Deterministic placement for designed NPCs and interactables. Agents choose WHAT appears; code decides WHERE:
 * reachable, off the road, away from the exit and from each other, and never in a way that blocks the route.
 */
export function placeDesign(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile, design: WorldDesign, sprites: Record<string, string>, foodTile?: Tile, buildings: { id: string; front: { x: number; y: number } }[] = [], zones: Zone[] = TEMPLATES.street.zones): WorldObject[] {
  const draft: NonNullable<DayScene["world"]> = { ...world, objects: [...world.objects] };
  const start = tileFeet(spawn), exitFeet = tileFeet(exit), food = foodTile ? tileFeet(foodTile) : undefined;
  const cells = [...reachableCells(draft, { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP })].map((k) => k.split(",").map(Number) as [number, number]);
  const placed: WorldObject[] = [];
  const wanted = [...design.interactables.map((a) => ({ ...a, role: "interactable" as const })), ...design.npcs.map((a) => ({ ...a, role: "npc" as const }))];
  for (const item of wanted) {
    // Supporting cast cannot shadow a photographed object's stable interaction ID.
    if (draft.objects.some(object => object.id === item.id)) continue;
    const lib = item.library ? actorById(item.library) : undefined;
    const sprite = lib ? actorSprite(lib.id) : sprites[`actor_${item.id}`];
    if (!sprite) throw new Error(`Missing sprite for ${item.id}`);
    const width = lib?.width ?? 32, height = lib?.height ?? 48;
    const footW = item.role === "npc" ? 12 : Math.min(width - 4, 28), footD = item.role === "npc" ? 6 : 8;
    const anchors = [start, exitFeet, ...(food ? [food] : []), ...draft.objects.map((o) => ({ x: o.x, y: o.y }))];
    // `near` is a building id or a zone id; resolve it to a target rectangle (or point) the candidates should sit inside.
    const nearZone = zones.find((z) => z.id === item.near), nearBuilding = buildings.find((b) => b.id === item.near);
    const target = nearZone ? { x: nearZone.x + nearZone.width / 2, y: nearZone.y + nearZone.height / 2, rect: nearZone }
      : nearBuilding ? { x: nearBuilding.front.x, y: nearBuilding.front.y + 8, rect: { x: nearBuilding.front.x - 70, y: nearBuilding.front.y - 14, width: 140, height: 44 } } : undefined;
    const inTarget = (x: number, y: number) => !target || (x >= target.rect.x - 12 && x <= target.rect.x + target.rect.width + 12 && y >= target.rect.y - 12 && y <= target.rect.y + target.rect.height + 12);
    // Benches, lamps and machines belong beside a path or paving; never floating in the middle of a lawn.
    const besidePath = (x: number, y: number) => [[0, 0], [TILE, 0], [-TILE, 0], [0, TILE], [0, -TILE], [TILE, TILE], [-TILE, TILE], [TILE, -TILE], [-TILE, -TILE]].some(([dx, dy]) => {
      const tile = world.ground[Math.floor((y + dy - 4) / TILE)]?.[Math.floor((x + dx) / TILE)];
      return tile === "p" || tile === "c";
    });
    const filterCells = (strict: boolean) => cells.filter(([x, y]) => {
      if (lib?.besidePath && !besidePath(x, y)) return false;
      const tile = world.ground[Math.floor(y / TILE)]?.[Math.floor(x / TILE)];
      // Keep feet off the dark kerb strip: nothing may stand within 12 px below road or kerb.
      const above = world.ground[Math.floor((y - 12) / TILE)]?.[Math.floor(x / TILE)];
      if (above === "r" || above === "k") return false;
      if (strict && !inTarget(x, y)) return false;
      return y >= 190 && y <= 430 && x >= width / 2 + 8 && x <= world.width * TILE - width / 2 - 8 && y - height >= 0 && tile !== undefined && "gfpc".includes(tile)
        && Math.hypot(x - exitFeet.x, y - exitFeet.y) > 70 && Math.hypot(x - start.x, y - start.y) > 40
        && draft.objects.every((o) => !o.collision || rectDistance(x, y, o.collision) > footW / 2 + 22);
    }).map(([x, y]) => ({ x, y, score: target ? -Math.hypot(target.x - x, target.y - y) : Math.min(...anchors.map((a) => Math.hypot(a.x - x, a.y - y))) }))
      .sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    // Prefer a spot where the design asked for it; if that area is full or blocked, any good spot beats dropping the actor.
    const candidates = target ? [...filterCells(true), ...filterCells(false)] : filterCells(false);
    let chosen: WorldObject | undefined;
    for (const c of candidates.slice(0, 14)) {
      const object: WorldObject = { id: item.id, name: item.name, sprite, x: c.x, y: c.y, width, height, text: item.text, role: item.role,
        collision: { x: c.x - Math.floor(footW / 2), y: c.y - footD, width: footW, height: footD },
        ...(item.role === "interactable" ? { effect: (item as { effect: NonNullable<WorldObject["effect"]> }).effect } : { lines: (item as { lines: string[] }).lines, roam: (item as { roam: number }).roam }) };
      const trial = { ...draft, objects: [...draft.objects, object] };
      if (exitReachable(trial, spawn, exit)) { chosen = object; break; }
    }
    if (!chosen) continue; // better to omit one actor than to risk a stuck player
    if (chosen.role === "npc") chosen.roam = safeRoam(draft, chosen);
    draft.objects.push(chosen); placed.push(chosen);
  }
  return placed;
}

/** Same small foot rectangle used by the canvas, also useful for route validation. */
export function worldCollision(world: NonNullable<DayScene["world"]>, px: number, py: number): boolean {
  if (px < 5 || px > world.width * TILE - 5 || py < 6 || py > world.height * TILE - 1) return true;
  const left = px - 4, right = px + 4, top = py - 5;
  if ([[left, top], [right, top], [left, py], [right, py]].some(([x, y]) => world.ground[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === "w")) return true;
  return world.objects.some(({ collision: box }) => box && right > box.x && left < box.x + box.width && py > box.y && top < box.y + box.height);
}
export function tileFeet(tile: Tile) { return { x: tile.x * TILE + 8, y: tile.y * TILE + 15 }; }

/** Sideways wander an NPC can do without ever stepping on road, kerb, water or another object. Checked every 2 px of its sweep. */
export function safeRoam(world: NonNullable<DayScene["world"]>, actor: WorldObject): number {
  const others = { ...world, objects: world.objects.filter((o) => o.id !== actor.id) };
  const walkable = (px: number) => {
    if (worldCollision(others, px, actor.y)) return false;
    const under = [others.ground[Math.floor(actor.y / TILE)]?.[Math.floor(px / TILE)], others.ground[Math.floor((actor.y - 12) / TILE)]?.[Math.floor(px / TILE)]];
    return !under.some((tile) => tile === "r" || tile === "k" || tile === "w");
  };
  const want = actor.roam ?? 0;
  for (let reach = 0; reach < want; reach += 2) if (!walkable(actor.x + reach + 2) || !walkable(actor.x - reach - 2)) return reach;
  return want;
}

export type Finding = { id: string; problem: string };
export type ActorState = {
  id: string; name: string; role: "npc" | "interactable"; x: number; y: number; zone?: string; groundUnderfoot: string;
  reachable: boolean; roam: number; nearestNeighbourPx: number | null; nearestBuilding?: string;
};
const GROUND_NAMES: Record<string, string> = { g: "grass", f: "flowers", p: "pavement", c: "cobbles", r: "road", k: "kerb", w: "water" };

/** What the finished layout actually looks like, in plain facts a reviewer (human or model) can reason about. */
export function worldState(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile, buildings: { id: string; front: { x: number; y: number } }[] = [], zones: Zone[] = TEMPLATES.street.zones) {
  const start = tileFeet(spawn), reach = reachableCells(world, { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP });
  const actors = world.objects.filter((o) => o.role).map((o): ActorState => {
    const others = world.objects.filter((p) => p.role && p.id !== o.id);
    const zone = zones.find((z) => o.x >= z.x - 20 && o.x <= z.x + z.width + 20 && o.y >= z.y - 20 && o.y <= z.y + z.height + 20)?.id;
    const nearestBuilding = [...buildings].sort((a, b) => Math.hypot(a.front.x - o.x, a.front.y - o.y) - Math.hypot(b.front.x - o.x, b.front.y - o.y))[0]?.id;
    const cellX = Math.round(o.x / STEP) * STEP, cellY = Math.round((o.y + 10) / STEP) * STEP;
    return { id: o.id, name: o.name, role: o.role!, x: o.x, y: o.y, zone, groundUnderfoot: GROUND_NAMES[world.ground[Math.floor(o.y / TILE)]?.[Math.floor(o.x / TILE)]] ?? "unknown",
      reachable: [[0, 0], [0, STEP], [0, -STEP], [STEP, 0], [-STEP, 0], [0, 2 * STEP], [0, -2 * STEP]].some(([dx, dy]) => reach.has(`${cellX + dx},${cellY + dy}`)),
      roam: o.roam ?? 0, nearestNeighbourPx: others.length ? Math.round(Math.min(...others.map((p) => Math.hypot(p.x - o.x, p.y - o.y)))) : null, nearestBuilding };
  });
  return { actors, exitReachable: exitReachable(world, spawn, exit) };
}

/** Deterministic physics and logic checks. An empty list means the world is safe to deliver. */
export function inspectWorld(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile): Finding[] {
  const findings: Finding[] = [];
  const state = worldState(world, spawn, exit);
  if (!state.exitReachable) findings.push({ id: "exit", problem: "the exit cannot be reached from the spawn point" });
  for (const a of state.actors) {
    const o = world.objects.find((x) => x.id === a.id)!;
    if (["road", "kerb", "water"].includes(a.groundUnderfoot)) findings.push({ id: a.id, problem: `${a.name} is standing on ${a.groundUnderfoot}` });
    const above = world.ground[Math.floor((o.y - 12) / TILE)]?.[Math.floor(o.x / TILE)];
    if (above === "r" || above === "k") findings.push({ id: a.id, problem: `${a.name} is on the edge of the road` });
    if (!a.reachable) findings.push({ id: a.id, problem: `${a.name} cannot be reached by the player` });
    if (a.nearestNeighbourPx !== null && a.nearestNeighbourPx < 24) findings.push({ id: a.id, problem: `${a.name} overlaps another character or object` });
    if (a.role === "npc" && a.roam > safeRoam(world, o)) findings.push({ id: a.id, problem: `${a.name} would wander onto the road or into an obstacle` });
    if (o.x - o.width / 2 < 0 || o.x + o.width / 2 > world.width * TILE || o.y - o.height < 0) findings.push({ id: a.id, problem: `${a.name} is outside the map` });
  }
  return findings;
}

/**
 * The world as a map a model can read: one character per tile. `.` grass, `,` flowers, `=` paving, `#` cobbles, `~` water, `_` road,
 * `-` kerb; on top: B building, T tree or hedge, L lamp, i interactable, n character, o other furniture, S start, E exit.
 */
export function worldAscii(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile): string[] {
  const map: Record<string, string> = { g: ".", f: ",", p: "=", c: "#", w: "~", r: "_", k: "-" };
  const rows = world.ground.map((row) => row.split("").map((ch) => map[ch] ?? "?"));
  const mark = (x: number, y: number, ch: string) => { const r = Math.floor(y / TILE), c = Math.floor(x / TILE); if (rows[r]?.[c] !== undefined) rows[r][c] = ch; };
  for (const o of world.objects) {
    const ch = o.id.startsWith("building_") ? "B" : o.role === "npc" ? "n" : o.role === "interactable" ? "i" : /tree|hedge/.test(o.id + o.name) ? "T" : /lamp/.test(o.id + o.name) ? "L" : "o";
    if (ch === "B") { for (let x = o.x - 72; x <= o.x + 72; x += TILE) mark(x, o.y - 8, "B"); } else mark(o.x, o.y - 4, ch);
  }
  mark(tileFeet(spawn).x, tileFeet(spawn).y, "S"); mark(tileFeet(exit).x, tileFeet(exit).y, "E");
  return rows.map((r) => r.join(""));
}
