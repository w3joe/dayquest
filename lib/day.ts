export type Tile = { x: number; y: number };
export type Landmark = { name: string; sprite: string; footprint: "S" | "M" | "L"; slot: number; text: string };
export type WorldObject = {
  id: string;
  name: string;
  sprite: string;
  /** Bottom-centre anchor in world pixels (16 pixels per ground tile). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absolute world-pixel rectangle, independent of the visible sprite bounds. */
  collision?: { x: number; y: number; width: number; height: number };
  text?: string;
};
export type SceneWorld = {
  /** Ground dimensions in tiles; each string is one row of g/f/p/c/r/k/w tiles. */
  width: number;
  height: number;
  ground: string[];
  objects: WorldObject[];
};
export type DayScene = {
  /** Stable external-provider key, required when a day contains multiple world scenes. */
  id?: string;
  kind: "tourist" | "meal" | "park";
  title: string;
  time: string;
  base: "city" | "street" | "park";
  skyline?: string;
  world?: SceneWorld;
  spawn: Tile;
  exit: Tile;
  landmarks: Landmark[];
  /** sprite: 16×16 on the table; icon: 32×32 for the textbox (optional, fall back to sprite). */
  food?: { sprite: string; icon?: string; tile: Tile; text: string };
};
export type TransitLeg =
  | { mode: "bus"; route: string; destination: string; from: string; to: string }
  | { mode: "tube"; line: string; color: string; stations: string[] };
export type TravelPoint = {
  kind: "bus_stop" | "station" | "path";
  label: string;
  tile: Tile;
  approach: Tile;
};
export type JourneyLeg = (TransitLeg | { mode: "walk"; from: string; to: string }) & { durationMs?: number };
export type Journey = {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  departure: TravelPoint;
  arrival: TravelPoint;
  legs: JourneyLeg[];
};
export type DayManifest = {
  id: string;
  date: string;
  player: {
    name: string;
    sprite: string;
    /** 96×192 PNG: 3 columns × 4 rows of 32×48 down/left/right/up walking frames. */
    walkSheet?: string;
  };
  scenes: DayScene[];
  transit: { legs: TransitLeg[] }[];
  journeys?: Journey[];
};

export function isDayId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Asset names are resolved relative to day.json, exactly as specified in §4.2. */
export function resolveDayAsset(asset: string, manifestUrl: string): string {
  // Shared game art is served by the app, even when this day's generated PNGs live on Blob.
  if (asset.startsWith("/") && !asset.startsWith("//")) return asset;
  const base = new URL(manifestUrl, "https://dayquest.local");
  const resolved = new URL(asset, base);
  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") throw new Error("Unsupported asset URL");
  return manifestUrl.startsWith("/") && resolved.origin === base.origin
    ? `${resolved.pathname}${resolved.search}`
    : resolved.href;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 5000;
}
function asset(value: unknown): value is string {
  if (!text(value) || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) return false;
  try {
    // Check before URL normalisation, including encoded traversal and backslashes.
    const path = decodeURIComponent(value.split(/[?#]/)[0]);
    if (path.includes("\\") || path.split("/").includes("..")) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return false;
    const url = new URL(value, "https://dayquest.local/days/day/day.json");
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
function tile(value: unknown, width = 20, height = 15): value is Tile {
  return object(value) && Number.isInteger(value.x) && Number.isInteger(value.y) &&
    (value.x as number) >= 0 && (value.x as number) < width && (value.y as number) >= 0 && (value.y as number) < height;
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}
function validWorld(value: unknown): value is SceneWorld {
  if (!object(value) || !integer(value.width, 20, 128) || !integer(value.height, 15, 128) ||
    !Array.isArray(value.ground) || value.ground.length !== value.height ||
    !value.ground.every(row => typeof row === "string" && row.length === value.width && /^[gfpcrkw]+$/.test(row)) ||
    !Array.isArray(value.objects) || value.objects.length === 0 || value.objects.length > 128) return false;
  const width = value.width * 16, height = value.height * 16;
  const ids = new Set<string>();
  for (const item of value.objects) {
    if (!object(item) || !text(item.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
      !text(item.name) || !asset(item.sprite) || !integer(item.x, 0, width) || !integer(item.y, 0, height) ||
      !integer(item.width, 1, width) || !integer(item.height, 1, height) ||
      item.x - item.width / 2 < 0 || item.x + item.width / 2 > width || item.y - item.height < 0 ||
      (item.text !== undefined && !text(item.text))) return false;
    ids.add(item.id);
    if (item.collision !== undefined) {
      const box = item.collision;
      if (!object(box) || !integer(box.x, 0, width) || !integer(box.y, 0, height) ||
        !integer(box.width, 1, width) || !integer(box.height, 1, height) ||
        box.x + box.width > width || box.y + box.height > height) return false;
    }
  }
  return true;
}
function overlaps(left: number, top: number, right: number, bottom: number, box: { x: number; y: number; width: number; height: number }): boolean {
  return right > box.x && left < box.x + box.width && bottom > box.y && top < box.y + box.height;
}
function clearFootprint(scene: DayScene, left: number, top: number, right: number, bottom: number): boolean {
  const world = scene.world;
  if (!world || left < 0 || top < 0 || right >= world.width * 16 || bottom >= world.height * 16) return false;
  for (let y = Math.floor(top / 16); y <= Math.floor(bottom / 16); y++) {
    for (let x = Math.floor(left / 16); x <= Math.floor(right / 16); x++) if (world.ground[y]?.[x] === "w") return false;
  }
  if (world.objects.some(item => item.collision && overlaps(left, top, right, bottom, item.collision))) return false;
  const food = scene.food?.tile;
  return !food || !overlaps(left, top, right, bottom, { x: food.x * 16, y: food.y * 16 + 6, width: 16, height: 10 });
}

/** Uses the same feet/body, water and lunch-table collisions as the world renderer. */
export function isSceneTileWalkable(scene: DayScene, point: Tile): boolean {
  if (!scene.world || !tile(point, scene.world.width, scene.world.height)) return false;
  const x = point.x * 16 + 8, y = point.y * 16 + 15;
  return clearFootprint(scene, x - 4, y - 5, x + 4, y);
}

/** Cardinal neighbour movement with a swept body: narrow fences between tile centres still block a route. */
export function sceneCanStep(scene: DayScene, from: Tile, to: Tile): boolean {
  if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1 || !isSceneTileWalkable(scene, from) || !isSceneTileWalkable(scene, to)) return false;
  return clearFootprint(scene, Math.min(from.x, to.x) * 16 + 4, Math.min(from.y, to.y) * 16 + 10,
    Math.max(from.x, to.x) * 16 + 12, Math.max(from.y, to.y) * 16 + 15);
}

/** Reachable tile keys ("x,y") for a collision-safe external transport adapter. */
export function sceneReachableTiles(scene: DayScene, from: Tile = scene.spawn): Set<string> {
  const reached = new Set<string>();
  if (!isSceneTileWalkable(scene, from)) return reached;
  const queue = [from]; reached.add(`${from.x},${from.y}`);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const next = { x: point.x + dx, y: point.y + dy }, key = `${next.x},${next.y}`;
      if (!reached.has(key) && sceneCanStep(scene, point, next)) { reached.add(key); queue.push(next); }
    }
  }
  return reached;
}

const endpoint = (leg: JourneyLeg, end: boolean): string => leg.mode === "tube" ? leg.stations[end ? leg.stations.length - 1 : 0] : end ? leg.to : leg.from;
export const journeyPointKind = (leg: JourneyLeg): TravelPoint["kind"] => leg.mode === "bus" ? "bus_stop" : leg.mode === "tube" ? "station" : "path";
const placeKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
function validLeg(leg: unknown, allowWalk: boolean): leg is JourneyLeg {
  if (!object(leg) || (leg.durationMs !== undefined && !integer(leg.durationMs, 1000, 15000))) return false;
  if (leg.mode === "bus") return [leg.route, leg.destination, leg.from, leg.to].every(text);
  if (leg.mode === "tube") return text(leg.line) && typeof leg.color === "string" && /^#[0-9a-f]{6}$/i.test(leg.color) &&
    Array.isArray(leg.stations) && leg.stations.length >= 2 && leg.stations.length <= 32 && leg.stations.every(text);
  return allowWalk && leg.mode === "walk" && text(leg.from) && text(leg.to);
}

/** Exactly one ordered keyed journey between each adjacent pair of world scenes. */
export function validateJourneys(scenes: DayScene[], value: unknown): asserts value is Journey[] {
  if (!Array.isArray(value) || value.length !== scenes.length - 1) throw new Error("Journeys must connect every adjacent scene");
  const sceneIds = new Set<string>();
  for (const scene of scenes) {
    if (!scene.world || ((scenes.length > 1 || scene.id !== undefined) && (!scene.id || !isDayId(scene.id) || sceneIds.has(scene.id)))) throw new Error("World scenes need unique stable IDs");
    if (scene.id) sceneIds.add(scene.id);
  }
  const journeyIds = new Set<string>();
  const reachable = new Map<DayScene, Set<string>>();
  const checkPoint = (point: unknown, scene: DayScene, leg: JourneyLeg, end: boolean) => {
    if (!object(point) || point.kind !== journeyPointKind(leg) || !text(point.label) || placeKey(point.label) !== placeKey(endpoint(leg, end)) ||
      !tile(point.tile, scene.world!.width, scene.world!.height) || !tile(point.approach, scene.world!.width, scene.world!.height)) {
      throw new Error("Invalid journey travel point");
    }
    const tiles = reachable.get(scene) ?? sceneReachableTiles(scene); reachable.set(scene, tiles);
    if (!tiles.has(`${point.tile.x},${point.tile.y}`) || !tiles.has(`${point.approach.x},${point.approach.y}`) ||
      !sceneCanStep(scene, point.tile, point.approach)) throw new Error("Journey travel point is blocked or unreachable");
  };
  for (let i = 0; i < value.length; i++) {
    const journey = value[i];
    if (!object(journey) || !text(journey.id) || !isDayId(journey.id) || journeyIds.has(journey.id) ||
      journey.fromSceneId !== scenes[i].id || journey.toSceneId !== scenes[i + 1].id ||
      !Array.isArray(journey.legs) || journey.legs.length === 0 || journey.legs.length > 24 || !journey.legs.every(leg => validLeg(leg, true))) {
      throw new Error("Invalid adjacent-scene journey");
    }
    journeyIds.add(journey.id);
    for (let leg = 1; leg < journey.legs.length; leg++) {
      if (placeKey(endpoint(journey.legs[leg - 1], true)) !== placeKey(endpoint(journey.legs[leg], false))) throw new Error("Journey legs must share transfer stops");
    }
    checkPoint(journey.departure, scenes[i], journey.legs[0], false);
    checkPoint(journey.arrival, scenes[i + 1], journey.legs[journey.legs.length - 1], true);
  }
}

/** Reject partial pipeline output before a game attempts to load it. */
export function parseDayManifest(value: unknown, expectedId: string): DayManifest {
  if (!object(value) || value.id !== expectedId || !isDayId(expectedId) || !text(value.date) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !object(value.player) || !text(value.player.name) || !asset(value.player.sprite) ||
    (value.player.walkSheet !== undefined && !asset(value.player.walkSheet)) || !Array.isArray(value.scenes) || !Array.isArray(value.transit)) throw new Error("Invalid day manifest");
  const worlds = value.scenes.length >= 1 && value.scenes.length <= 12 && value.scenes.every(scene => object(scene) && scene.world !== undefined);
  const legacy = value.scenes.length === 3 && value.transit.length === 2 && value.journeys === undefined && value.scenes.every(scene => object(scene) && scene.world === undefined);
  if (!legacy && !(worlds && value.transit.length === 0)) throw new Error("Invalid day scene sequence");
  if (worlds && value.scenes.length > 1 && value.journeys === undefined) throw new Error("Multi-scene worlds require keyed journeys");
  const kinds = ["tourist", "meal", "park"];
  for (const [index, scene] of value.scenes.entries()) {
    if (!object(scene)) throw new Error("Invalid scene in day manifest");
    const world = scene.world;
    if (world !== undefined && !validWorld(world)) throw new Error("Invalid scene world");
    const width = world ? world.width : 20, height = world ? world.height : 15;
    if (!(worlds ? kinds.includes(String(scene.kind)) : scene.kind === kinds[index]) || !["city", "street", "park"].includes(String(scene.base)) ||
      !text(scene.title) || !text(scene.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scene.time) || !tile(scene.spawn, width, height) || !tile(scene.exit, width, height) ||
      (scene.skyline !== undefined && !asset(scene.skyline)) || !Array.isArray(scene.landmarks) || (world ? scene.landmarks.length > 3 : scene.landmarks.length !== 3)) {
      throw new Error("Invalid scene in day manifest");
    }
    if (scene.id !== undefined && (typeof scene.id !== "string" || !isDayId(scene.id))) throw new Error("Invalid scene ID");
    if (world && (!isSceneTileWalkable(scene as DayScene, scene.spawn as Tile) || !isSceneTileWalkable(scene as DayScene, scene.exit as Tile))) {
      throw new Error("Scene spawn or exit is blocked");
    }
    const slots = new Set<number>();
    for (const landmark of scene.landmarks) {
      if (!object(landmark) || !text(landmark.name) || !asset(landmark.sprite) || !text(landmark.text) ||
        !["S", "M", "L"].includes(String(landmark.footprint)) || !Number.isInteger(landmark.slot) ||
        (landmark.slot as number) < 0 || (landmark.slot as number) > 2 || slots.has(landmark.slot as number)) {
        throw new Error("Invalid landmark in day manifest");
      }
      slots.add(landmark.slot as number);
    }
    if (scene.food !== undefined && (!object(scene.food) || !asset(scene.food.sprite) ||
      (scene.food.icon !== undefined && !asset(scene.food.icon)) || !tile(scene.food.tile, width, height) || !text(scene.food.text))) {
      throw new Error("Invalid food in day manifest");
    }
  }
  if (worlds && value.journeys !== undefined) validateJourneys(value.scenes as DayScene[], value.journeys);
  for (const transition of value.transit) {
    if (!object(transition) || !Array.isArray(transition.legs) || transition.legs.length === 0 || !transition.legs.every(leg => validLeg(leg, false))) throw new Error("Invalid transit");
  }
  return value as DayManifest;
}

export function generatedManifestUrl(id: string, blobBaseUrl: string): string {
  if (!isDayId(id)) throw new Error("Invalid day ID");
  const base = new URL(blobBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Invalid Blob base URL");
  return new URL(`days/${id}/day.json`, `${base.href.replace(/\/$/, "")}/`).href;
}
