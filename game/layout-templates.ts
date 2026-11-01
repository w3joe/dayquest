/**
 * Location templates: the ground, entrances and named zones for a kind of place. Models pick a template and the code builds it, so every
 * world is walkable by construction. All templates share the 40 x 28 tile map, spawn (20,12) and the three building/feature slots.
 */
import type { Composition } from "./composition";

export type TemplateId = "street" | "garden" | "plaza" | "riverside";
export const WORLD_COLS = 40;
export const WORLD_ROWS = 28;
export type Zone = { id: string; label: string; use: string; x: number; y: number; width: number; height: number };
export type LayoutTemplate = {
  id: TemplateId;
  label: string;
  /** For the models: what this place is like and when to choose it. */
  describe: string;
  /** Which kinds of place its sprites suit (actor library `grounds`). The first is used for hand-written fallbacks. */
  grounds: ("street" | "park" | "plaza")[];
  ground: (x: number, y: number) => string;
  zones: Zone[];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  foodTile: { x: number; y: number };
  /** Candidate spots (world px, feet) for furniture, tried in order and skipped if blocked. */
  lamps: [number, number][];
  trees: [number, number][];
  /** Candidate spots for the up-to-six photo props, tried in order. */
  propSlots: [number, number][];
  /** Extra fixed furniture: [library kind, x, y, optional text]. */
  fixed: [string, number, number][];
  /** The scenery that makes this place look like itself: ponds, lawns, beds, paving. Also the first worked example for the composer. */
  defaults: Composition;
  /** A pedestrian crossing and painted road markings, only on templates with a road. */
  crossing?: { col: number; row: number; rows: number };
};

const flowerish = (x: number, y: number) => (x * 7 + y * 3) % 11 === 0 ? "f" : "g";

const street: LayoutTemplate = {
  id: "street", label: "Street", describe: "A town street: shopfronts along the top, pavement, a road with a zebra crossing, pavement and verges below. Choose for high streets, shops, cafes, city or residential roads.", grounds: ["street"],
  ground: (x, y) => {
    if (y < 10) return "c";
    if (y === 13 || y === 18) return "k";
    if (y > 13 && y < 18) return "r";
    if (y >= 21 && y <= 24 && (x < 15 || x > 26)) return flowerish(x, y);
    return "p";
  },
  zones: [
    { id: "north_pavement", label: "the pavement along the front of the buildings", use: "sidewalk", x: 16, y: 176, width: 608, height: 32 },
    { id: "south_pavement", label: "the pavement on the far side of the road", use: "sidewalk", x: 16, y: 304, width: 608, height: 36 },
    { id: "west_verge", label: "the grassy verge on the left, near the trees", use: "verge", x: 16, y: 340, width: 224, height: 64 },
    { id: "east_verge", label: "the grassy verge on the right, near the trees", use: "verge", x: 416, y: 340, width: 208, height: 64 },
    { id: "crossing_north", label: "the north end of the pedestrian crossing", use: "sidewalk", x: 256, y: 176, width: 128, height: 32 },
    { id: "crossing_south", label: "the south end of the pedestrian crossing", use: "sidewalk", x: 256, y: 304, width: 128, height: 36 },
    { id: "south_plaza", label: "the open paved area at the bottom of the scene", use: "plaza", x: 16, y: 404, width: 608, height: 36 },
  ],
  spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 }, foodTile: { x: 19, y: 19 },
  lamps: [[32, 205], [208, 205], [432, 205], [608, 205]],
  trees: [[48, 372], [160, 372], [480, 372], [592, 372]],
  propSlots: [[70, 317], [175, 405], [465, 405], [570, 317], [230, 420], [410, 420]],
  fixed: [["car_red", 110, 260], ["cycle_stand", 230, 189], ["bin_grey", 420, 171], ["aboard", 274, 290]],
  crossing: { col: 18, row: 14, rows: 4 },
  defaults: { ground: [], features: [] },
};

const garden: LayoutTemplate = {
  id: "garden", label: "Garden", describe: "A green garden, village green or small park: lawns and flower beds, a pond, winding paths. Choose for gardens, parks, greens, allotments, churchyards and quiet outdoor spots.", grounds: ["park"],
  ground: (x, y) => {
    if (y === 11 || y === 12) return "p";                                   // the main path along the front
    if ((x === 19 || x === 20) && y >= 13) return "p";                      // the path down the middle
    if ((y === 19 || y === 20) && x >= 19) return "p";                      // the path out to the east exit
    return "g";
  },
  zones: [
    { id: "front_path", label: "the main path along the front of the garden", use: "sidewalk", x: 16, y: 176, width: 608, height: 32 },
    { id: "middle_path", label: "the path running down the middle", use: "sidewalk", x: 296, y: 224, width: 48, height: 200 },
    { id: "pond_shore", label: "the lawn around the pond on the left", use: "verge", x: 16, y: 230, width: 240, height: 150 },
    { id: "flower_beds", label: "the flower beds on the right lawn", use: "verge", x: 400, y: 224, width: 224, height: 80 },
    { id: "east_path", label: "the path leading out to the east gate", use: "sidewalk", x: 360, y: 304, width: 264, height: 36 },
    { id: "south_lawn", label: "the open lawn at the bottom of the garden", use: "verge", x: 16, y: 372, width: 608, height: 68 },
  ],
  spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 }, foodTile: { x: 24, y: 16 },
  lamps: [[96, 205], [240, 205], [400, 205], [560, 205]],
  trees: [[48, 420], [592, 420], [180, 410], [470, 410]],
  propSlots: [[150, 395], [260, 330], [400, 270], [560, 280], [460, 400], [90, 300]],
  fixed: [],
  defaults: {
    ground: [
      { op: "water", x: 3, y: 14, w: 10, h: 9, shape: "blob" },
      { op: "lawn", x: 0, y: 0, w: 40, h: 10, shape: "rect", flowers: 0.5 },
      { op: "bed", x: 26, y: 14, w: 11, h: 4, density: 0.55 },
      { op: "bed", x: 2, y: 24, w: 10, h: 3, density: 0.4 },
      { op: "path", points: [[19, 25], [8, 25]], width: 1, material: "p" },
    ],
    features: [
      { op: "row", kind: "hedge", from: [22, 26], to: [37, 26], spacing: 3 },
      { op: "grove", kind: "tree", cx: 31, cy: 22, count: 4, radius: 4 },
    ],
  },
};

const plaza: LayoutTemplate = {
  id: "plaza", label: "Plaza", describe: "A paved square or courtyard: open cobbled centre, planters, arcades along one side. Choose for squares, piazzas, markets, station forecourts, courtyards and campus quads.", grounds: ["plaza"],
  ground: (x, y) => {
    if (y < 10) return "c";
    return "p";
  },
  zones: [
    { id: "arcade", label: "the paving in front of the buildings", use: "sidewalk", x: 16, y: 176, width: 608, height: 32 },
    { id: "centre_square", label: "the cobbled centre of the square", use: "plaza", x: 192, y: 224, width: 256, height: 150 },
    { id: "west_planter", label: "the planter beds on the left", use: "verge", x: 40, y: 250, width: 100, height: 100 },
    { id: "east_planter", label: "the planter beds on the right", use: "verge", x: 490, y: 250, width: 100, height: 100 },
    { id: "south_edge", label: "the paving along the bottom of the square", use: "plaza", x: 16, y: 390, width: 608, height: 50 },
  ],
  spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 }, foodTile: { x: 11, y: 14 },
  lamps: [[64, 205], [256, 205], [384, 205], [576, 205]],
  trees: [[96, 352], [560, 352], [60, 420], [590, 420]],
  propSlots: [[170, 300], [470, 300], [300, 400], [140, 400], [520, 400], [330, 260]],
  fixed: [],
  defaults: {
    ground: [
      { op: "paving", x: 12, y: 14, w: 16, h: 10, pattern: "border", material: "c" },
      { op: "lawn", x: 3, y: 16, w: 6, h: 6, shape: "ellipse", flowers: 0.6 },
      { op: "lawn", x: 31, y: 16, w: 6, h: 6, shape: "ellipse", flowers: 0.6 },
    ],
    features: [{ op: "row", kind: "bollard", from: [10, 14], to: [10, 24], spacing: 3 }],
  },
};

const riverside: LayoutTemplate = {
  id: "riverside", label: "Riverside", describe: "A walk beside a river, canal or shore: a promenade, the water, a bridge across, and a lawn on the far bank. Choose for rivers, canals, harbours, lakes and seafronts.", grounds: ["park", "plaza"],
  ground: (x, y) => {
    if (y < 10) return "c";
    if (y >= 10 && y <= 12) return "p";
    if (y >= 14 && y <= 19) return x === 19 || x === 20 ? "p" : "g";        // the far side of the bank; the middle is a bridge
    if (y >= 20 && y <= 22) return "p";
    if (y === 13) return flowerish(x, y);
    return y >= 23 ? flowerish(x, y) : "p";
  },
  zones: [
    { id: "north_promenade", label: "the promenade in front of the buildings", use: "sidewalk", x: 16, y: 176, width: 608, height: 32 },
    { id: "north_bank", label: "the grassy bank on the near side of the water", use: "verge", x: 16, y: 208, width: 608, height: 16 },
    { id: "bridge", label: "the bridge across the water", use: "sidewalk", x: 296, y: 224, width: 48, height: 96 },
    { id: "south_promenade", label: "the promenade on the far bank", use: "sidewalk", x: 16, y: 320, width: 608, height: 48 },
    { id: "south_lawn", label: "the lawn behind the far promenade", use: "verge", x: 16, y: 372, width: 608, height: 68 },
  ],
  spawn: { x: 20, y: 12 }, exit: { x: 39, y: 21 }, foodTile: { x: 24, y: 22 },
  lamps: [[48, 205], [208, 205], [432, 205], [592, 205], [100, 350], [520, 350]],
  trees: [[60, 410], [200, 420], [440, 420], [590, 410]],
  propSlots: [[120, 345], [250, 360], [400, 345], [560, 360], [130, 400], [500, 405]],
  fixed: [],
  defaults: {
    ground: [
      { op: "water", x: 0, y: 14, w: 40, h: 6, shape: "rect" },
      { op: "bed", x: 2, y: 23, w: 12, h: 3, density: 0.45 },
    ],
    features: [{ op: "row", kind: "hedge", from: [24, 26], to: [37, 26], spacing: 3 }],
  },
};

export const TEMPLATES: Record<TemplateId, LayoutTemplate> = { street, garden, plaza, riverside };
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const defaultTemplateFor = (ground: "street" | "park" | "plaza"): TemplateId => ({ street: "street", park: "garden", plaza: "plaza" } as const)[ground];
