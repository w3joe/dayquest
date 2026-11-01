import type { DayScene, Tile, WorldObject } from "../lib/day";
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
    const x = [112, 320, 528][i], y = 160;
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
  return { world: { width: WORLD_COLS, height: WORLD_ROWS, ground, objects } satisfies NonNullable<DayScene["world"]>,
    spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 }, foodTile: { x: 19, y: 19 } };
}

/** Same small foot rectangle used by the canvas, also useful for route validation. */
export function worldCollision(world: NonNullable<DayScene["world"]>, px: number, py: number): boolean {
  if (px < 5 || px > world.width * TILE - 5 || py < 6 || py > world.height * TILE - 1) return true;
  const left = px - 4, right = px + 4, top = py - 5;
  if ([[left, top], [right, top], [left, py], [right, py]].some(([x, y]) => world.ground[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === "w")) return true;
  return world.objects.some(({ collision: box }) => box && right > box.x && left < box.x + box.width && py > box.y && top < box.y + box.height);
}
export function tileFeet(tile: Tile) { return { x: tile.x * TILE + 8, y: tile.y * TILE + 15 }; }
