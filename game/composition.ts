/**
 * The scenery kit. A scene is a walkable skeleton (the template: paths, route, building row) plus a Composition: a short list of
 * closed, validated operations (ponds, lawns, beds, paving, paths; rows and groves of trees, hedges and lamps). A model can only
 * choose from this vocabulary, and code decides the exact tiles, so what it composes is always renderable and checkable.
 */
import { WORLD_COLS, WORLD_ROWS } from "./layout-templates";

export const SHAPES = ["rect", "ellipse", "blob"] as const;
export type Shape = (typeof SHAPES)[number];
export const FEATURE_KINDS = ["tree", "hedge", "lamp", "bollard", "cycle_stand", "aboard", "bin_grey", "bin_purple"] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export type GroundOp =
  | { op: "lawn"; x: number; y: number; w: number; h: number; shape: Shape; flowers: number }   // repaint paving back to grass, with scattered flowers (0 to 1)
  | { op: "water"; x: number; y: number; w: number; h: number; shape: Shape }                    // a pond, lake or river reach
  | { op: "bed"; x: number; y: number; w: number; h: number; density: number }                   // a flower bed (0.2 to 1)
  | { op: "paving"; x: number; y: number; w: number; h: number; pattern: "plain" | "border" | "cross"; material: "p" | "c" }
  | { op: "path"; points: [number, number][]; width: 1 | 2; material: "p" | "c" };               // a footpath through the given tile points
export type FeatureOp =
  | { op: "row"; kind: FeatureKind; from: [number, number]; to: [number, number]; spacing: number }
  | { op: "grove"; kind: "tree" | "hedge"; cx: number; cy: number; count: number; radius: number }
  | { op: "place"; kind: FeatureKind; x: number; y: number };
export type Composition = { ground: GroundOp[]; features: FeatureOp[] };

export const MAX_GROUND_OPS = 20, MAX_FEATURE_OPS = 20, MAX_FEATURES = 48;
export const EMPTY: Composition = { ground: [], features: [] };

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const tile = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && int(p[0], 0, WORLD_COLS - 1) && int(p[1], 0, WORLD_ROWS - 1);

/** Structural check of a composition (types, bounds, sizes, counts). Reachability is checked separately against the real layout. */
export function checkComposition(c: unknown): { ok: true; composition: Composition } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const raw = (c ?? {}) as { ground?: unknown; features?: unknown };
  const ground = Array.isArray(raw.ground) ? raw.ground : [], features = Array.isArray(raw.features) ? raw.features : [];
  if (ground.length > MAX_GROUND_OPS) issues.push(`at most ${MAX_GROUND_OPS} ground operations`);
  if (features.length > MAX_FEATURE_OPS) issues.push(`at most ${MAX_FEATURE_OPS} feature operations`);
  const rect = (o: Record<string, unknown>, i: number, minSize = 2) => {
    if (!int(o.x, 0, WORLD_COLS - 1) || !int(o.y, 0, WORLD_ROWS - 1) || !int(o.w, minSize, WORLD_COLS) || !int(o.h, minSize, WORLD_ROWS)) { issues.push(`ground[${i}]: x, y, w, h must be whole tiles on the map (w and h at least ${minSize})`); return; }
    if ((o.x as number) + (o.w as number) > WORLD_COLS || (o.y as number) + (o.h as number) > WORLD_ROWS) issues.push(`ground[${i}]: extends past the edge of the map`);
  };
  ground.forEach((o: Record<string, unknown>, i: number) => {
    switch (o.op) {
      case "lawn": rect(o, i); if (!(SHAPES as readonly string[]).includes(String(o.shape))) issues.push(`ground[${i}]: shape must be rect, ellipse or blob`); if (typeof o.flowers !== "number" || o.flowers < 0 || o.flowers > 1) issues.push(`ground[${i}]: flowers is 0 to 1`); break;
      case "water": rect(o, i, 3); if (!(SHAPES as readonly string[]).includes(String(o.shape))) issues.push(`ground[${i}]: shape must be rect, ellipse or blob`); break;
      case "bed": rect(o, i); if (typeof o.density !== "number" || o.density < 0.2 || o.density > 1) issues.push(`ground[${i}]: density is 0.2 to 1`); break;
      case "paving": rect(o, i); if (!["plain", "border", "cross"].includes(String(o.pattern)) || !["p", "c"].includes(String(o.material))) issues.push(`ground[${i}]: pattern plain|border|cross and material p|c`); break;
      case "path": if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length > 8 || !o.points.every(tile) || ![1, 2].includes(Number(o.width)) || !["p", "c"].includes(String(o.material))) issues.push(`ground[${i}]: path needs 2 to 8 on-map points, width 1 or 2, material p or c`); break;
      default: issues.push(`ground[${i}]: unknown operation "${String(o.op)}"`);
    }
  });
  features.forEach((o: Record<string, unknown>, i: number) => {
    const kindOk = (FEATURE_KINDS as readonly string[]).includes(String(o.kind));
    if (!kindOk) issues.push(`features[${i}]: unknown kind "${String(o.kind)}"`);
    if (o.op === "row") { if (!tile(o.from) || !tile(o.to) || !int(o.spacing, 2, 12)) issues.push(`features[${i}]: row needs on-map from and to points and spacing 2 to 12 tiles`); }
    else if (o.op === "grove") { if (!["tree", "hedge"].includes(String(o.kind)) || !int(o.cx, 0, WORLD_COLS - 1) || !int(o.cy, 0, WORLD_ROWS - 1) || !int(o.count, 2, 12) || !int(o.radius, 1, 8)) issues.push(`features[${i}]: grove needs kind tree or hedge, an on-map centre, count 2 to 12, radius 1 to 8`); }
    else if (o.op === "place") { if (!int(o.x, 0, WORLD_COLS - 1) || !int(o.y, 0, WORLD_ROWS - 1)) issues.push(`features[${i}]: place needs an on-map x and y`); }
    else issues.push(`features[${i}]: unknown operation "${String(o.op)}"`);
  });
  return issues.length ? { ok: false, issues } : { ok: true, composition: { ground: ground as GroundOp[], features: features as FeatureOp[] } };
}

/** Deterministic organic edge: the same inputs always give the same shape, so a world renders identically every time. */
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function inShape(shape: Shape, x: number, y: number, o: { x: number; y: number; w: number; h: number }): boolean {
  if (x < o.x || y < o.y || x >= o.x + o.w || y >= o.y + o.h) return false;
  if (shape === "rect") return true;
  const cx = o.x + o.w / 2 - 0.5, cy = o.y + o.h / 2 - 0.5, rx = o.w / 2, ry = o.h / 2;
  const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  return d < (shape === "ellipse" ? 1.02 : 0.78 + noise(x, y) * 0.5);
}

/** Paints the ground operations over a skeleton. Only lawn tiles can be repainted by water, beds and paths, so routes and buildings stay intact. */
export function applyGround(ground: string[], ops: GroundOp[]): string[] {
  const grid = ground.map((row) => row.split(""));
  const soft = (x: number, y: number) => grid[y]?.[x] === "g" || grid[y]?.[x] === "f";
  for (const op of ops) {
    if (op.op === "path") {
      for (let i = 1; i < op.points.length; i++) {
        let [x, y] = op.points[i - 1]; const [tx, ty] = op.points[i];
        const paint = (px: number, py: number) => { for (let dx = 0; dx < op.width; dx++) for (let dy = 0; dy < op.width; dy++) if (soft(px + dx, py + dy)) grid[py + dy][px + dx] = op.material; };
        paint(x, y);
        while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); paint(x, y); }
      }
      continue;
    }
    for (let y = op.y; y < op.y + op.h; y++) for (let x = op.x; x < op.x + op.w; x++) {
      if (y >= WORLD_ROWS || x >= WORLD_COLS) continue;
      if (op.op === "lawn") { if (inShape(op.shape, x, y, op)) grid[y][x] = noise(x * 3, y * 5) < op.flowers * 0.4 ? "f" : "g"; }
      else if (op.op === "water") { if (soft(x, y) && inShape(op.shape, x, y, op)) grid[y][x] = "w"; }
      else if (op.op === "bed") { if (soft(x, y) && noise(x * 7, y * 3) < op.density) grid[y][x] = "f"; }
      else if (op.op === "paving" && (grid[y][x] === "p" || grid[y][x] === "c" || soft(x, y))) {
        const edge = x === op.x || y === op.y || x === op.x + op.w - 1 || y === op.y + op.h - 1;
        const middle = x === op.x + Math.floor(op.w / 2) || y === op.y + Math.floor(op.h / 2);
        const other = op.material === "c" ? "p" : "c";
        grid[y][x] = op.pattern === "plain" ? op.material : op.pattern === "border" ? (edge ? "c" : "p") : (middle ? op.material : other);
      }
    }
  }
  return grid.map((row) => row.join(""));
}

/** Expands feature operations into tile positions (kind, x, y). Order is stable; callers skip any that cannot stand safely. */
export function expandFeatures(ops: FeatureOp[]): { kind: FeatureKind; x: number; y: number }[] {
  const out: { kind: FeatureKind; x: number; y: number }[] = [];
  for (const op of ops) {
    if (op.op === "place") out.push({ kind: op.kind, x: op.x, y: op.y });
    else if (op.op === "row") {
      const dx = op.to[0] - op.from[0], dy = op.to[1] - op.from[1], len = Math.max(Math.abs(dx), Math.abs(dy)), steps = Math.floor(len / op.spacing);
      for (let i = 0; i <= steps; i++) out.push({ kind: op.kind, x: Math.round(op.from[0] + (dx * i * op.spacing) / (len || 1)), y: Math.round(op.from[1] + (dy * i * op.spacing) / (len || 1)) });
    } else {
      for (let i = 0; i < op.count; i++) {
        const angle = i * 2.399963 + op.cx, r = op.radius * Math.sqrt((i + 0.5) / op.count);
        out.push({ kind: op.kind, x: Math.round(op.cx + Math.cos(angle) * r), y: Math.round(op.cy + Math.sin(angle) * r * 0.7) });
      }
    }
  }
  return out.slice(0, MAX_FEATURES);
}
