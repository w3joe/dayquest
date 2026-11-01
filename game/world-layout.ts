import type { DayScene, Tile, WorldObject } from "../lib/day";
import { actorById, actorSprite } from "../lib/actor-library";
import type { WorldDesign } from "../pipeline/world-design";
import type { SceneBlueprint } from "../pipeline/scene-types";
import { TILE } from "./maps";

export const WORLD_COLS = 40;
export const WORLD_ROWS = 28;
export const LIBRARY = "/tiles/dq/library/";
const furniture: Record<string, { width: number; height: number; depth: number }> = {
  tree: { width: 53, height: 60, depth: 9 }, lamp: { width: 15, height: 58, depth: 6 },
  bollard: { width: 10, height: 20, depth: 5 }, cycle_stand: { width: 26, height: 28, depth: 8 },
  aboard: { width: 21, height: 28, depth: 8 }, hedge: { width: 55, height: 20, depth: 9 },
  bin_grey: { width: 18, height: 26, depth: 8 }, bin_purple: { width: 18, height: 26, depth: 8 }, car_blue: { width: 55, height: 34, depth: 12 }, car_red: { width: 59, height: 34, depth: 12 },
};

/** Named regions of the street layout, in world pixels. The design agents refer to these by id; code resolves them to real positions. */
export const WORLD_ZONES = [
  { id: "north_pavement", label: "the pavement along the front of the buildings", use: "sidewalk", x: 16, y: 176, width: 608, height: 32 },
  { id: "south_pavement", label: "the pavement on the far side of the road", use: "sidewalk", x: 16, y: 304, width: 608, height: 36 },
  { id: "west_verge", label: "the grassy verge on the left, near the trees", use: "verge", x: 16, y: 340, width: 224, height: 64 },
  { id: "east_verge", label: "the grassy verge on the right, near the trees", use: "verge", x: 416, y: 340, width: 208, height: 64 },
  { id: "crossing_north", label: "the north end of the pedestrian crossing", use: "sidewalk", x: 256, y: 176, width: 128, height: 32 },
  { id: "crossing_south", label: "the south end of the pedestrian crossing", use: "sidewalk", x: 256, y: 304, width: 128, height: 36 },
  { id: "south_plaza", label: "the open paved area at the bottom of the scene", use: "plaza", x: 16, y: 404, width: 608, height: 36 },
] as const;
export type ZoneId = (typeof WORLD_ZONES)[number]["id"];
const BUILDING_X = [112, 320, 528];
/** Where each building stands and where people would approach it from. */
export const buildingAnchors = (blueprint: SceneBlueprint) =>
  blueprint.buildings.slice(0, 3).map((b, i) => ({ id: b.id, name: b.name, x: BUILDING_X[i], y: 160, front: { x: BUILDING_X[i], y: 190 } }));

/** Stable walkable composition. Asset generation never decides collision geometry. */
export function buildWorldLayout(blueprint: SceneBlueprint, sprites: Record<string, string>) {
  const ground = Array.from({ length: WORLD_ROWS }, (_, y) => Array.from({ length: WORLD_COLS }, (_, x) => {
    if (y < 10) return "c";
    if (y === 13 || y === 18) return "k";
    if (y > 13 && y < 18) return "r";
    if (y >= 21 && y <= 24 && (x < 15 || x > 26)) return (x + y) % 7 === 0 ? "f" : "g";
    return blueprint.ground === "park" && y > 19 && (x < 14 || x > 27) ? "g" : "p";
  }).join(""));
  const objects: WorldObject[] = blueprint.buildings.slice(0, 3).map((building, i) => {
    const x = BUILDING_X[i], y = 160;
    const sprite = sprites[building.id];
    if (!sprite) throw new Error(`Missing sprite for ${building.id}`);
    return { id: building.id, name: building.name, text: building.description, sprite,
      x, y, width: 160, height: 128, collision: { x: x - 72, y: y - 25, width: 144, height: 25 } };
  });
  function prop(id: string, name: string, kind: string, x: number, y: number, text?: string, sprite?: string) {
    const spec = sprite ? { width: 32, height: 48, depth: 8 } : furniture[kind] ?? { width: 32, height: 40, depth: 8 };
    objects.push({ id, name, sprite: sprite ?? `${LIBRARY}${kind}.png`, x, y, width: spec.width, height: spec.height,
      collision: { x: x - Math.floor(Math.min(spec.width - 4, 28) / 2), y: y - spec.depth, width: Math.min(spec.width - 4, 28), height: spec.depth }, text });
  }
  // Furniture frames the route rather than crossing it. All entrance approaches remain clear.
  [32, 208, 432, 608].forEach((x, i) => prop(`street_lamp_${i}`, "Street light", "lamp", x, 205));
  [48, 160, 480, 592].forEach((x, i) => prop(`verge_tree_${i}`, "Neighbourhood tree", "tree", x, 372));
  prop("parked_car", "Parked car", "car_red", 110, 260);
  prop("bike_rack", "Cycle stand", "cycle_stand", 230, 189);
  prop("street_bin", "Recycling bin", "bin_grey", 420, 171);
  prop("cafe_board", "A little lunch spot", "aboard", 274, 290, blueprint.food?.text ?? "A good place to pause and watch the street.");
  blueprint.props.slice(0, 6).forEach((item, i) => {
    if (item.library && !furniture[item.library]) throw new Error(`Unknown furniture library asset: ${item.library}`);
    if (!item.library && !sprites[item.id]) throw new Error(`Missing sprite for ${item.id}`);
    const kind = item.library ?? "custom";
    prop(item.id, item.name, kind, [70, 175, 465, 570, 230, 410][i], [317, 405, 405, 317, 420, 420][i], item.description, sprites[item.id]);
  });
  const world = { width: WORLD_COLS, height: WORLD_ROWS, ground, objects } satisfies NonNullable<DayScene["world"]>;
  const spawn = { x: 20, y: 12 }, exit = { x: 39, y: 20 }, foodTile = { x: 19, y: 19 };
  const placed = blueprint.design ? placeDesign(world, spawn, exit, blueprint.design, sprites, foodTile, buildingAnchors(blueprint)) : [];
  world.objects.push(...placed);
  return { world, spawn, exit, foodTile };
}

const STEP = 8;
/** Lattice cells the player can stand on, flooding outwards from `from`. */
export function reachableCells(world: NonNullable<DayScene["world"]>, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]), queue = [from];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (!seen.has(key) && !worldCollision(world, nx, ny)) { seen.add(key); queue.push({ x: nx, y: ny }); }
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
export function placeDesign(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile, design: WorldDesign, sprites: Record<string, string>, foodTile?: Tile, buildings: { id: string; front: { x: number; y: number } }[] = []): WorldObject[] {
  const draft: NonNullable<DayScene["world"]> = { ...world, objects: [...world.objects] };
  const start = tileFeet(spawn), exitFeet = tileFeet(exit), food = foodTile ? tileFeet(foodTile) : undefined;
  const cells = [...reachableCells(draft, { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP })].map((k) => k.split(",").map(Number) as [number, number]);
  const placed: WorldObject[] = [];
  const wanted = [...design.interactables.map((a) => ({ ...a, role: "interactable" as const })), ...design.npcs.map((a) => ({ ...a, role: "npc" as const }))];
  for (const item of wanted) {
    const lib = item.library ? actorById(item.library) : undefined;
    const sprite = lib ? actorSprite(lib.id) : sprites[`actor_${item.id}`];
    if (!sprite) throw new Error(`Missing sprite for ${item.id}`);
    const width = lib?.width ?? 32, height = lib?.height ?? 48;
    const footW = item.role === "npc" ? 12 : Math.min(width - 4, 28), footD = item.role === "npc" ? 6 : 8;
    const anchors = [start, exitFeet, ...(food ? [food] : []), ...draft.objects.map((o) => ({ x: o.x, y: o.y }))];
    // `near` is a building id or a zone id; resolve it to a target rectangle (or point) the candidates should sit inside.
    const nearZone = WORLD_ZONES.find((z) => z.id === item.near), nearBuilding = buildings.find((b) => b.id === item.near);
    const target = nearZone ? { x: nearZone.x + nearZone.width / 2, y: nearZone.y + nearZone.height / 2, rect: nearZone }
      : nearBuilding ? { x: nearBuilding.front.x, y: nearBuilding.front.y + 8, rect: { x: nearBuilding.front.x - 70, y: nearBuilding.front.y - 14, width: 140, height: 44 } } : undefined;
    const inTarget = (x: number, y: number) => !target || (x >= target.rect.x - 12 && x <= target.rect.x + target.rect.width + 12 && y >= target.rect.y - 12 && y <= target.rect.y + target.rect.height + 12);
    const filterCells = (strict: boolean) => cells.filter(([x, y]) => {
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
export function worldState(world: NonNullable<DayScene["world"]>, spawn: Tile, exit: Tile, buildings: { id: string; front: { x: number; y: number } }[] = []) {
  const start = tileFeet(spawn), reach = reachableCells(world, { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP });
  const actors = world.objects.filter((o) => o.role).map((o): ActorState => {
    const others = world.objects.filter((p) => p.role && p.id !== o.id);
    const zone = WORLD_ZONES.find((z) => o.x >= z.x - 20 && o.x <= z.x + z.width + 20 && o.y >= z.y - 20 && o.y <= z.y + z.height + 20)?.id;
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
