import type { DayScene, Landmark } from "@/lib/day";

export const TILE = 16;
export const MAP_W = 20;
export const MAP_H = 15;
export const VIEW_W = MAP_W * TILE;
export const VIEW_H = MAP_H * TILE;

/** Frame indices into public/tiles/dq-atlas.png (one row of generated 16 px tiles, see scripts/build-atlas.mjs). */
export const FRAMES = { grass: 0, flowers: 1, path: 2, cobble: 3, water: 4, hedge: 5 } as const;

/** Deterministic scatter so flower tiles do not change between visits. */
export const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/**
 * Ground legend: `.` grass, `p` path, `w` water, `t` tree (blocks), `_` sky (not drawn, blocks).
 * `p` over water rows is a bridge.
 */
type BaseMap = {
  rows: string[];
  /** Each slot is a 5-wide span starting at `x`; the landmark sits on `bottom` and is centred in the span. */
  slots: { x: number; bottom: number }[];
  sky: number;
  /** Optional foreground flavour: tile and an image-tinted overlay drawn above the ground. */
  skylineY?: number;
};

export const BASE_MAPS: Record<DayScene["base"], BaseMap> = {
  city: {
    sky: 0x9fd0e8,
    skylineY: 0,
    rows: [
      "____________________",
      "____________________",
      "____________________",
      "____________________",
      "wwwwwwwwwwppwwwwwwww",
      "wwwwwwwwwwppwwwwwwww",
      "..........pp........",
      "..........pp........",
      "..........pp........",
      "..........pp........",
      "..........pp........",
      "..........pppppppppp",
      "..........pppppppppp",
      "..........pp........",
      "..........pp........",
    ],
    slots: [{ x: 0, bottom: 9 }, { x: 13, bottom: 9 }, { x: 5, bottom: 9 }],
  },
  street: {
    sky: 0x9fd0e8,
    rows: [
      "tttttt........tttttt",
      "tttttt........tttttt",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppp......",
      "......pppppppppppppp",
      "......pppppppppppppp",
      "......pppppppp......",
      "......pppppppp......",
    ],
    slots: [{ x: 0, bottom: 8 }, { x: 14, bottom: 8 }, { x: 0, bottom: 13 }],
  },
  park: {
    sky: 0x9fd0e8,
    rows: [
      "....ttt.....wwwwwwww",
      "....ttt....wwwwwwwww",
      "...........wwwwwwwww",
      "...........wwwwwwwww",
      "....ppppppp.wwwwwwww",
      "....p.....p..wwwwwww",
      "....p.....p..wwwwwww",
      "....p.....p..wwwwwww",
      "....p.....p.........",
      "....ppppppp.........",
      "..........pp........",
      "..........pppppppppp",
      "..........pppppppppp",
      "..........pp........",
      "..........pp........",
    ],
    slots: [{ x: 0, bottom: 8 }, { x: 5, bottom: 6 }, { x: 14, bottom: 9 }],
  },
};

export const FOOTPRINT: Record<Landmark["footprint"], { w: number; h: number }> = {
  S: { w: 3, h: 3 },
  M: { w: 4, h: 4 },
  L: { w: 5, h: 4 },
};

export type Placement = { landmark: Landmark; x0: number; y0: number; w: number; h: number };

export function placeLandmark(base: DayScene["base"], landmark: Landmark): Placement {
  const slot = BASE_MAPS[base].slots[landmark.slot];
  const { w, h } = FOOTPRINT[landmark.footprint];
  return { landmark, x0: slot.x + Math.floor((5 - w) / 2), y0: slot.bottom - h + 1, w, h };
}

export function tileAt(base: DayScene["base"], x: number, y: number): string {
  return BASE_MAPS[base].rows[y]?.[x] ?? "_";
}

export function groundBlocked(base: DayScene["base"], x: number, y: number): boolean {
  const c = tileAt(base, x, y);
  return c === "w" || c === "t" || c === "_";
}

/**
 * The exit comes from day.json, so a map must never strand the player. Finds the cheapest route from spawn to exit
 * (landmark footprints are impassable, water/trees/sky can be bridged at a cost) and returns the ground tiles to turn into path.
 */
export function carveRoute(base: DayScene["base"], spawn: { x: number; y: number }, exit: { x: number; y: number }, landmarkBlocked: Set<string>): Set<string> {
  const key = (x: number, y: number) => `${x},${y}`;
  const cost = (x: number, y: number) => (landmarkBlocked.has(key(x, y)) ? Infinity : groundBlocked(base, x, y) ? 6 : 1);
  const dist = new Map<string, number>([[key(spawn.x, spawn.y), 0]]);
  const prev = new Map<string, string>();
  const open: [number, number, number][] = [[0, spawn.x, spawn.y]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, x, y] = open.shift()!;
    if (x === exit.x && y === exit.y) break;
    if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const c = cost(nx, ny);
      if (c === Infinity) continue;
      const nd = d + c;
      if (nd < (dist.get(key(nx, ny)) ?? Infinity)) { dist.set(key(nx, ny), nd); prev.set(key(nx, ny), key(x, y)); open.push([nd, nx, ny]); }
    }
  }
  const carved = new Set<string>();
  for (let at: string | undefined = key(exit.x, exit.y); at && prev.has(at); at = prev.get(at)) {
    const [x, y] = at.split(",").map(Number);
    if (groundBlocked(base, x, y)) carved.add(at);
  }
  if (groundBlocked(base, exit.x, exit.y)) carved.add(key(exit.x, exit.y));
  return carved;
}
