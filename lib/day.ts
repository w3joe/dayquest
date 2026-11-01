export type Tile = { x: number; y: number };
export type Landmark = { name: string; sprite: string; footprint: "S" | "M" | "L"; slot: number; text: string };
export type DayScene = {
  kind: "tourist" | "meal" | "park";
  title: string;
  time: string;
  base: "city" | "street" | "park";
  skyline?: string;
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
  player: { name: string; sprite: string };
  scenes: DayScene[];
  transit: { legs: TransitLeg[] }[];
};

export function isDayId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Asset names are resolved relative to day.json, exactly as specified in §4.2. */
export function resolveDayAsset(asset: string, manifestUrl: string): string {
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
  if (!text(value) || value.includes("\\") || value.split(/[/?#]/).includes("..")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return /^https?:\/\//i.test(value);
  return !value.startsWith("//");
}
function tile(value: unknown): value is Tile {
  return object(value) && Number.isInteger(value.x) && Number.isInteger(value.y) &&
    (value.x as number) >= 0 && (value.x as number) < 20 && (value.y as number) >= 0 && (value.y as number) < 15;
}

/** Reject partial pipeline output before a game attempts to load it. */
export function parseDayManifest(value: unknown, expectedId: string): DayManifest {
  if (!object(value) || value.id !== expectedId || !isDayId(expectedId) || !text(value.date) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !object(value.player) ||
    !text(value.player.name) || !asset(value.player.sprite) || !Array.isArray(value.scenes) || value.scenes.length !== 3 ||
    !Array.isArray(value.transit) || value.transit.length !== 2) throw new Error("Invalid day manifest");
  const kinds = ["tourist", "meal", "park"];
  for (const [index, scene] of value.scenes.entries()) {
    if (!object(scene) || scene.kind !== kinds[index] || !["city", "street", "park"].includes(String(scene.base)) ||
      !text(scene.title) || !text(scene.time) || !/^\d{2}:\d{2}$/.test(scene.time) || !tile(scene.spawn) || !tile(scene.exit) ||
      (scene.skyline !== undefined && !asset(scene.skyline)) || !Array.isArray(scene.landmarks) || scene.landmarks.length !== 3) {
      throw new Error("Invalid scene in day manifest");
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
    if (scene.food !== undefined && (!object(scene.food) || !asset(scene.food.sprite) || !tile(scene.food.tile) || !text(scene.food.text))) {
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
