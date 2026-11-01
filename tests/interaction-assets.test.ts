import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldLayout } from "../game/world-layout";
import type { DayScene } from "../lib/day";
import { parseSharedInteractionCatalog, photoWorldInteractionCatalog } from "../lib/interaction-assets";
import { loadInteractionCatalog } from "../lib/server/interaction-catalog";
import { mockScenePlan } from "../pipeline/scene-plan";

function photoScene(): DayScene {
  const blueprint = mockScenePlan({ lunch: Buffer.from("offline photo fixture") });
  const layout = buildWorldLayout(blueprint, { building_0: "building_0.png", building_1: "building_1.png", building_2: "building_2.png" });
  return { kind: "tourist", title: blueprint.title, time: "12:00", base: "street", landmarks: [], world: layout.world,
    spawn: layout.spawn, exit: layout.exit,
    food: { sprite: "food.png", tile: layout.foodTile, name: "Tomato sandwich", description: "Seeded bread, tomato and lettuce.", text: "A quiet pause." } };
}

test("the shared production catalogue cannot substitute fixed characters, meals or photo props", () => {
  const shared = loadInteractionCatalog().catalog;
  assert.ok(shared.assets.length > 0);
  assert.ok(shared.assets.every(asset => asset.kind === "effect"));
  assert.ok(!shared.assets.some(asset => /ramen|lucas/.test(asset.id)));
  for (const kind of ["prop", "pose"]) {
    assert.throws(() => parseSharedInteractionCatalog({ version: 1, assets: [
      { id: "fixed_subject", src: "/interactions/library/sample.png", width: 32, height: 32, kind },
    ] }), /dynamically generated scene assets/);
  }
});

test("live food pickup reuses the exact generated meal instead of a canned library bowl", () => {
  const scene = photoScene(), shared = loadInteractionCatalog().catalog, before = structuredClone(shared);
  const catalog = photoWorldInteractionCatalog(scene, shared);
  const food = catalog.assets.find(asset => asset.id === "generated_food")!;
  assert.equal(food.src, scene.food!.sprite);
  assert.equal(food.kind, "prop");
  assert.deepEqual([food.width, food.height], [32, 32]);
  assert.match(food.description!, /Tomato sandwich/);
  assert.doesNotMatch(food.description!, /ramen/i);
  assert.deepEqual(shared, before);
  assert.ok(catalog.assets.every(asset => asset.kind === "effect" || asset.id === "generated_food"));
});

test("a world without a lunch photo has no carried food and fixed food cannot enter the photo-world adapter", () => {
  const scene = photoScene(), shared = loadInteractionCatalog().catalog;
  delete scene.food;
  assert.deepEqual(photoWorldInteractionCatalog(scene, shared), shared);
  scene.food = { sprite: "/interactions/library/ramen-bowl-v1.png", tile: { x: 19, y: 19 }, text: "A fixed sample." };
  assert.throws(() => photoWorldInteractionCatalog(scene, shared), /generated food.png/);
});
