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
function clearTile(point: Tile, world: SceneWorld): boolean {
  // Match the renderer's bottom-anchored player feet and small collision body.
  const x = point.x * 16 + 8, y = point.y * 16 + 15;
  const left = x - 4, right = x + 4, top = y - 5;
  const dry = [[left, top], [right, top], [left, y], [right, y]].every(([px, py]) =>
    world.ground[Math.floor(py / 16)]?.[Math.floor(px / 16)] !== "w");
  return dry && world.objects.every(item => {
    const box = item.collision;
    return !box || right <= box.x || left >= box.x + box.width || y <= box.y || top >= box.y + box.height;
  });
}

/** Reject partial pipeline output before a game attempts to load it. */
export function parseDayManifest(value: unknown, expectedId: string): DayManifest {
  if (!object(value) || value.id !== expectedId || !isDayId(expectedId) || !text(value.date) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !object(value.player) ||
    !text(value.player.name) || !asset(value.player.sprite) ||
    (value.player.walkSheet !== undefined && !asset(value.player.walkSheet)) || !Array.isArray(value.scenes) ||
    !Array.isArray(value.transit) || !(
      (value.scenes.length === 3 && value.transit.length === 2) ||
      (value.scenes.length === 1 && value.transit.length === 0 && object(value.scenes[0]) && value.scenes[0].world !== undefined)
    )) throw new Error("Invalid day manifest");
  const kinds = ["tourist", "meal", "park"];
  for (const [index, scene] of value.scenes.entries()) {
    if (!object(scene)) throw new Error("Invalid scene in day manifest");
    const world = scene.world;
    if (world !== undefined && !validWorld(world)) throw new Error("Invalid scene world");
    const width = world ? world.width : 20, height = world ? world.height : 15;
    if (!(value.scenes.length === 1 ? kinds.includes(String(scene.kind)) : scene.kind === kinds[index]) || !["city", "street", "park"].includes(String(scene.base)) ||
      !text(scene.title) || !text(scene.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scene.time) || !tile(scene.spawn, width, height) || !tile(scene.exit, width, height) ||
      (scene.skyline !== undefined && !asset(scene.skyline)) || !Array.isArray(scene.landmarks) || (world ? scene.landmarks.length > 3 : scene.landmarks.length !== 3)) {
      throw new Error("Invalid scene in day manifest");
    }
    if (world && (!clearTile(scene.spawn as Tile, world) || !clearTile(scene.exit as Tile, world))) {
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
  for (const transition of value.transit) {
    if (!object(transition) || !Array.isArray(transition.legs) || transition.legs.length === 0) throw new Error("Invalid transit");
    for (const leg of transition.legs) {
      if (!object(leg) || (leg.mode !== "bus" && leg.mode !== "tube")) throw new Error("Invalid transit leg");
      if (leg.mode === "bus" && ![leg.route, leg.destination, leg.from, leg.to].every(text)) throw new Error("Invalid bus leg");
      if (leg.mode === "tube" && (!text(leg.line) || typeof leg.color !== "string" || !/^#[0-9a-f]{6}$/i.test(leg.color) ||
        !Array.isArray(leg.stations) || leg.stations.length < 2 || !leg.stations.every(text))) throw new Error("Invalid tube leg");
    }
  }
  return value as DayManifest;
}

export function generatedManifestUrl(id: string, blobBaseUrl: string): string {
  if (!isDayId(id)) throw new Error("Invalid day ID");
  const base = new URL(blobBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Invalid Blob base URL");
  return new URL(`days/${id}/day.json`, `${base.href.replace(/\/$/, "")}/`).href;
}
