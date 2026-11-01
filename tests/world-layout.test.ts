import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldLayout, tileFeet, worldCollision } from "../game/world-layout";
import { parseDayManifest, type DayManifest } from "../lib/day";
import type { SceneBlueprint } from "../pipeline/scene-types";

const blueprint: SceneBlueprint = {
  title: "A photo becomes a street", locationName: "My place", description: "A familiar corner", time: "12:30", ground: "street", source: "photo",
  buildings: [0, 1, 2].map(i => ({ id: `building_${i}`, name: `Place ${i}`, description: `Read about place ${i}`, observed: i === 0 })),
  props: ["tree", "lamp", "cycle_stand", "aboard", "bin_grey", "car_red"].map((library, i) => ({ id: `prop_${i}`, name: library, description: `Street object ${i}`, library })),
  food: { name: "Lunch", description: "My meal", text: "A lunch worth remembering" },
};
const sprites = Object.fromEntries(blueprint.buildings.map(item => [item.id, `${item.id}.png`]));

test("photo world is deterministic and passes the saved manifest contract", () => {
  const layout = buildWorldLayout(blueprint, sprites);
  assert.deepEqual(layout, buildWorldLayout(blueprint, sprites));
  const manifest: DayManifest = {
    id: "world-test", date: "2026-11-01", player: { name: "Visitor", sprite: "player.png", walkSheet: "player_walk.png" }, transit: [],
    scenes: [{ kind: "tourist", title: blueprint.title, time: blueprint.time, base: "street", world: layout.world, spawn: layout.spawn, exit: layout.exit, landmarks: [],
      food: { tile: layout.foodTile, sprite: "food.png", text: blueprint.food!.text } }],
  };
  assert.equal(parseDayManifest(manifest, manifest.id), manifest);
  assert.equal(layout.world.objects.filter(item => item.id.startsWith("building_")).length, 3);
  assert.throws(() => buildWorldLayout(blueprint, {}), /Missing sprite/);
});

test("spawn reaches the exit, food and every building without crossing a footprint", () => {
  for (const ground of ["street", "park", "plaza"] as const) {
    const { world, spawn, exit, foodTile } = buildWorldLayout({ ...blueprint, ground }, sprites);
    const foodBox = { x: foodTile.x * 16, y: foodTile.y * 16 + 6, width: 16, height: 10 };
    world.objects.push({ id: "meal_table", name: "Lunch", sprite: "food.png", x: foodBox.x + 8, y: foodBox.y + 10, width: 16, height: 16, collision: foodBox });
    const visited = new Set<string>(), queue = [spawn];
    for (let i = 0; i < queue.length; i++) {
      const tile = queue[i], key = `${tile.x},${tile.y}`;
      const point = tileFeet(tile);
      if (visited.has(key) || worldCollision(world, point.x, point.y)) continue;
      visited.add(key);
      queue.push({ x: tile.x - 1, y: tile.y }, { x: tile.x + 1, y: tile.y }, { x: tile.x, y: tile.y - 1 }, { x: tile.x, y: tile.y + 1 });
    }
    assert.ok(visited.has(`${spawn.x},${spawn.y}`));
    assert.ok(visited.has(`${exit.x},${exit.y}`), `${ground}: exit is reachable`);
    for (const building of world.objects.filter(item => item.id.startsWith("building_"))) {
      assert.ok([...visited].some(key => { const [x, y] = key.split(",").map(Number); const p = tileFeet({ x, y }); return Math.hypot(p.x - building.x, p.y - building.y) < 34 && p.y > building.y; }), `${ground}: ${building.name} entrance reachable`);
      assert.ok(worldCollision(world, building.x, building.y - 2), "Building feet block movement");
      assert.equal(worldCollision(world, building.x, building.y - 80), false, "A tall sprite does not block the entire image rectangle");
    }
    assert.ok([[foodTile.x - 1, foodTile.y], [foodTile.x + 1, foodTile.y], [foodTile.x, foodTile.y - 1], [foodTile.x, foodTile.y + 1]].some(([x, y]) => visited.has(`${x},${y}`)), "Meal interaction is reachable");
  }
});
