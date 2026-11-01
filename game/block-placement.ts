import type { WorldBlock } from "../lib/world-kit";

export class WorldPlacementError extends Error {
  readonly code = "WORLD_PLACEMENT_FAILED";
  constructor(public readonly objectId: string) { super(`No safe placement for photographed object ${objectId}`); }
}

/** Context is an affinity. Geometry, dry feet and collision safety remain mandatory. */
export function relaxedBlockContext(block: WorldBlock): WorldBlock {
  return { ...block, requestedUsage: block.usage, usage: { ...block.usage, area: "open" },
    allowedGround: ["g", "f", "p", "c"], connectsTo: "none",
    placementNote: "The requested area had no safe slot; this photographed object was kept on compatible dry ground nearby." };
}

export type BlockAnchor = { id: string; front: { x: number; y: number } };
const groundAt = (ground: string[], x: number, y: number) => ground[Math.floor(y / 16)]?.[Math.floor(x / 16)];
const adjacent = (ground: string[], x: number, y: number, materials: string, radius: number) => {
  for (let dy = -radius; dy <= radius; dy += 16) for (let dx = -radius; dx <= radius; dx += 16) {
    const tile = groundAt(ground, x + dx, y + dy);
    if (tile && materials.includes(tile)) return true;
  }
  return false;
};

/** Hard surface constraints inspect the entire collision foot, not just the anchor pixel. */
export function blockFitsGround(block: WorldBlock, ground: string[], x: number, y: number): boolean {
  const half = block.footprint.width / 2;
  for (let dy = -block.footprint.depth; dy <= 0; dy += Math.max(1, block.footprint.depth / 2)) for (const dx of [-half, 0, half]) {
    if (!block.allowedGround.includes(groundAt(ground, x + dx, y + dy) ?? "")) return false;
  }
  if (block.usage.area === "greenery" && !"gf".includes(groundAt(ground, x, y) ?? "?")) return false;
  if (block.usage.area === "frontage" && !"pc".includes(groundAt(ground, x, y) ?? "?")) return false;
  if (block.usage.area === "path_edge" && !adjacent(ground, x, y, "pc", 16)) return false;
  if (block.usage.area === "waterfront" && !adjacent(ground, x, y, "w", 32)) return false;
  return true;
}

/** Relationships win over the old arbitrary slot; ties stay deterministic. */
export function rankBlockSpots(block: WorldBlock, ground: string[], spots: [number, number][], anchors: BlockAnchor[]): [number, number][] {
  const near = anchors.find(anchor => anchor.id === block.usage.near);
  const preferred = spots[0];
  const score = ([x, y]: [number, number]) => near ? Math.hypot(x - near.front.x, y - near.front.y) : Math.hypot(x - preferred[0], y - preferred[1]);
  const unique = [...new Map(spots.map(spot => [spot.join(","), spot])).values()];
  return unique.filter(([x, y]) => blockFitsGround(block, ground, x, y)).sort((a, b) => score(a) - score(b) || a[1] - b[1] || a[0] - b[0]);
}
