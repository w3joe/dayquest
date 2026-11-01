import assert from "node:assert/strict";
import test from "node:test";
import { applyGround } from "../game/composition";
import { buildWorldLayout, exitReachable, reachableCells, tileFeet } from "../game/world-layout";
import { TEMPLATES, TEMPLATE_IDS } from "../game/layout-templates";
import { parseDayManifest, type DayManifest, type DayScene } from "../lib/day";
import { compileInteractionPack } from "../lib/interactions";
import { mockScenePlan } from "../pipeline/scene-plan";
import { fallbackDesign } from "../pipeline/world-design";

function blueprint() {
  const plan = mockScenePlan({ landmark: Buffer.from("offline fixture"), lunch: Buffer.from("offline fixture") });
  const sprites = Object.fromEntries(plan.buildings.map(building => [building.id, `generated/${building.id}.png`]));
  return { plan, sprites };
}
function asScene(layout: ReturnType<typeof buildWorldLayout>): DayScene {
  return { kind: "tourist", title: "Generated place", time: "12:00", base: "street", landmarks: [], world: layout.world, spawn: layout.spawn, exit: layout.exit,
    food: { sprite: "generated/food.png", tile: layout.foodTile, text: "Photographed lunch", name: "Soup", description: "A bowl of red soup." } };
}
function manifest(scene: DayScene): DayManifest {
  return { id: "merged-world", date: "2026-11-01", player: { name: "You", sprite: "generated/player.png" }, scenes: [scene], transit: [] };
}

test("every location template supports generated subject assets, front-side interactions and native actor metadata together", () => {
  for (const template of TEMPLATE_IDS) {
    const { plan, sprites } = blueprint();
    plan.template = template; plan.ground = TEMPLATES[template].grounds[0];
    plan.design = fallbackDesign(plan.ground, TEMPLATES[template].zones);
    const layout = buildWorldLayout(plan, sprites), location = asScene(layout);
    location.interactionPack = compileInteractionPack(location, { actions: [
      { id: "look", targetId: "building_1", label: "Look at this place", repeatable: true, steps: [{ type: "say", text: "The photographed place." }] },
      { id: "lunch", targetId: "food", label: "Remember lunch", repeatable: true, steps: [{ type: "say", text: "Your lunch." }] },
    ] }, { version: 1, assets: [] });
    assert.equal(parseDayManifest(manifest(location), "merged-world").scenes[0].food!.name, "Soup");
    const approach = location.interactionPack.actions[0].approach;
    assert.ok(approach.y * 16 + 15 >= 160, `${template}: character remains visible in front of the building`);
    assert.ok(layout.world.objects.some(object => object.role === "npc" && Array.isArray(object.lines)));
    assert.ok(layout.world.objects.some(object => object.role === "interactable" && object.effect));
    assert.equal(layout.world.objects.find(object => object.id === "building_0")!.sprite, "generated/building_0.png");
  }
});

test("lawn followed by water cannot erase a protected template bridge or route", () => {
  const template = TEMPLATES.riverside;
  const skeleton = Array.from({ length: 28 }, (_, y) => Array.from({ length: 40 }, (_, x) => template.ground(x, y)).join(""));
  const ground = applyGround(skeleton, [{ op: "lawn", x: 0, y: 0, w: 40, h: 28, shape: "rect", flowers: 0 }, { op: "water", x: 0, y: 0, w: 40, h: 28, shape: "rect" }]);
  for (let row = 14; row < 20; row++) {
    assert.notEqual(ground[row][19], "w"); assert.notEqual(ground[row][20], "w");
  }
  assert.notEqual(ground[template.spawn.y][template.spawn.x], "w");
});

test("flooded preferred slots relocate photographed props and lunch without static subject substitutions", () => {
  const { plan, sprites } = blueprint();
  plan.template = "garden"; plan.ground = "park";
  plan.props = [{ id: "photo_statue", name: "Blue statue", description: "The distinctive blue statue from the supplied photo." }];
  sprites.photo_statue = "generated/photo_statue.png";
  plan.composition = { ground: [{ op: "water", x: 0, y: 0, w: 40, h: 28, shape: "rect" }], features: [] };
  const layout = buildWorldLayout(plan, sprites), location = asScene(layout);
  const statue = layout.world.objects.find(object => object.id === "photo_statue");
  assert.ok(statue, "a blocked preferred slot must not silently discard a photographed subject");
  assert.equal(statue.sprite, "generated/photo_statue.png");
  assert.notEqual(layout.world.ground[layout.foodTile.y][layout.foodTile.x], "w");
  assert.notDeepEqual(layout.foodTile, TEMPLATES.garden.foodTile);
  for (const building of layout.world.objects.filter(object => object.id.startsWith("building_"))) {
    assert.notEqual(layout.world.ground[Math.floor((building.y - 1) / 16)][Math.floor(building.x / 16)], "w");
  }
  location.interactionPack = compileInteractionPack(location, { actions: [{ id: "meal", targetId: "food", label: "Remember lunch", repeatable: true,
    steps: [{ type: "say", text: "Your photographed meal." }] }] }, { version: 1, assets: [] });
  assert.equal(parseDayManifest(manifest(location), "merged-world").scenes[0].food!.sprite, "generated/food.png");
});

test("a blocked spawn and a thin full-width fence cannot be reported as an accessible exit", () => {
  const { plan, sprites } = blueprint();
  const layout = buildWorldLayout(plan, sprites);
  const start = tileFeet(layout.spawn);
  const blocked = { ...layout.world, objects: [...layout.world.objects, { id: "blocking", name: "Blocking", sprite: "block.png", x: start.x, y: start.y,
    width: 8, height: 8, collision: { x: start.x - 4, y: start.y - 5, width: 8, height: 5 } }] };
  assert.equal(reachableCells(blocked, start).size, 0);
  assert.equal(exitReachable(blocked, layout.spawn, layout.exit), false);
  const fenced = { ...layout.world, objects: [...layout.world.objects, { id: "fence", name: "Fence", sprite: "fence.png", x: 320, y: 287,
    width: 640, height: 1, collision: { x: 0, y: 286, width: 640, height: 1 } }] };
  assert.equal(exitReachable(fenced, layout.spawn, layout.exit), false);
});

test("merged actor metadata never weakens removable capabilities or crossing bounds", () => {
  const { plan, sprites } = blueprint();
  const location = asScene(buildWorldLayout(plan, sprites));
  location.world!.objects[0].role = "npc"; location.world!.objects[0].lines = ["Hello again."]; location.world!.objects[0].roam = 12;
  location.world!.objects[0].removable = true;
  assert.doesNotThrow(() => parseDayManifest(manifest(location), "merged-world"));
  Reflect.set(location.world!.objects[0], "removable", "yes");
  assert.throws(() => parseDayManifest(manifest(location), "merged-world"), /Invalid scene world/);
  location.world!.objects[0].removable = true;
  location.world!.crossing = { col: 39, row: 14, rows: 4 };
  assert.throws(() => parseDayManifest(manifest(location), "merged-world"), /Invalid scene world/);
});
