import type { DayScene, Landmark } from "@/lib/day";

export const TILE = 16;
export const MAP_W = 20;
export const MAP_H = 15;
export const VIEW_W = MAP_W * TILE;
export const VIEW_H = MAP_H * TILE;

/** Shared by B's manifest builder and A's playable maps. All exits sit on the edge path. */
export const BASE_LAYOUT: Record<DayScene["base"], { spawn: { x: number; y: number }; exit: { x: number; y: number }; food?: { x: number; y: number } }> = {
  city: { spawn: { x: 10, y: 13 }, exit: { x: 19, y: 12 } },
  street: { spawn: { x: 10, y: 13 }, exit: { x: 19, y: 12 }, food: { x: 9, y: 8 } },
  park: { spawn: { x: 10, y: 13 }, exit: { x: 19, y: 12 } },
};

/** Frame indices into the Shadwell-derived 16px atlas; see scripts/build-game-art.mjs. */
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
