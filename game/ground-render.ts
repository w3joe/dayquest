import type { DayScene } from "../lib/day";
import { TILE } from "./maps";

type World = NonNullable<DayScene["world"]>;
const MATERIAL: Record<string, string> = { g: "grass", f: "flowers", p: "pavement", c: "cobble", r: "road", k: "kerb" };
const SIDES: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const green = (ch?: string) => ch === "g" || ch === "f";
const paved = (ch?: string) => ch === "p" || ch === "c";

/** A strip along one side of a tile, `t` pixels deep. */
function strip(g: CanvasRenderingContext2D, px: number, py: number, side: [number, number], t: number) {
  const [dx, dy] = side;
  if (dy === -1) g.fillRect(px, py, TILE, t); else if (dy === 1) g.fillRect(px, py + TILE - t, TILE, t);
  else if (dx === -1) g.fillRect(px, py, t, TILE); else g.fillRect(px + TILE - t, py, t, TILE);
}

/**
 * Bakes the whole ground once per scene, then softens every boundary so shapes read as natural: a muddy bank and bright foam where land
 * meets water, a darker lip where lawn meets paving, and a pale kerb line on the paving side.
 */
export function renderGround(world: World, picture: (url: string) => HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = world.width * TILE; canvas.height = world.height * TILE;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const at = (c: number, r: number) => world.ground[r]?.[c];
  for (let r = 0; r < world.height; r++) for (let c = 0; c < world.width; c++) {
    const ch = at(c, r)!;
    // "Flowers" are plain lawn with a few tiny blooms painted on, so beds read as flowers rather than a different material.
    g.drawImage(picture(ch === "w" ? "/tiles/dq/water.png" : `/tiles/dq/library/${MATERIAL[ch === "f" ? "g" : ch] ?? "pavement"}.png`), c * TILE, r * TILE, TILE, TILE);
    if (ch === "f") for (let i = 0; i < 3; i++) {
      const h = Math.abs(Math.sin((c * 12.9898 + r * 78.233 + i * 37.719) * 43758.5453)), k = h * 1000 % 1;
      g.fillStyle = ["#fff6d8", "#ffd84a", "#ff8fb3", "#c9a4ff"][Math.floor(k * 4)];
      g.fillRect(c * TILE + 1 + Math.floor((h * 977 % 1) * 12), r * TILE + 1 + Math.floor((h * 313 % 1) * 12), 2, 2);
    }
  }
  for (let r = 0; r < world.height; r++) for (let c = 0; c < world.width; c++) {
    const ch = at(c, r)!, px = c * TILE, py = r * TILE;
    for (const side of SIDES) {
      const n = at(c + side[0], r + side[1]);
      if (n === undefined || n === ch) continue;
      if (ch === "w") { g.fillStyle = "rgba(226,243,246,.85)"; strip(g, px, py, side, 1); }                                   // foam on the water side
      else if (n === "w") { g.fillStyle = "#6d5a3c"; strip(g, px, py, side, 3); g.fillStyle = "#8a7650"; strip(g, px, py, side, 1); } // bank on the land side
      else if (green(ch) && paved(n)) { g.fillStyle = "rgba(60,120,52,.7)"; strip(g, px, py, side, 1); }                    // darker lawn lip
      else if (paved(ch) && green(n)) { g.fillStyle = "rgba(240,228,190,.6)"; strip(g, px, py, side, 1); }                   // pale kerb line
    }
  }
  return canvas;
}

/** Slow drifting light on water tiles inside the camera. Cheap: a few dashes per tile, no per-tile images. */
export function drawWaterShimmer(ctx: CanvasRenderingContext2D, world: World, elapsed: number, camX: number, camY: number, viewW: number, viewH: number) {
  const c0 = Math.max(0, Math.floor(camX / TILE)), c1 = Math.min(world.width - 1, Math.ceil((camX + viewW) / TILE));
  const r0 = Math.max(0, Math.floor(camY / TILE)), r1 = Math.min(world.height - 1, Math.ceil((camY + viewH) / TILE));
  ctx.fillStyle = "rgba(255,255,255,.22)";
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (world.ground[r][c] !== "w") continue;
    const phase = (elapsed / 520 + c * 1.3 + r * 2.1) % 6;
    if (phase < 3) ctx.fillRect(c * TILE + 2 + Math.floor(phase * 3), r * TILE + 4 + ((c + r) % 3) * 4, 5, 1);
  }
}
