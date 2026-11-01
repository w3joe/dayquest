import assert from "node:assert/strict";
import test from "node:test";
import { TEMPLATES, TEMPLATE_IDS, WORLD_COLS, WORLD_ROWS, type TemplateId } from "../game/layout-templates";
import { buildWorldLayout, exitReachable, inspectWorld, reachableCells, templateFor, tileFeet } from "../game/world-layout";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { mockScenePlan } from "../pipeline/scene-plan";
import { fallbackDesign } from "../pipeline/world-design";

function build(template: TemplateId, ground: "street" | "park" | "plaza" = "street") {
  const blueprint = mockScenePlan({ landmark: Buffer.from("x"), lunch: Buffer.from("x") });
  blueprint.template = template; blueprint.ground = ground;
  const chosen = templateFor(blueprint);
  blueprint.design = fallbackDesign(chosen.grounds[0], chosen.zones); // the same way production builds it
  const sprites: Record<string, string> = {};
  for (const item of [...blueprint.buildings, ...blueprint.props, ...blueprint.design.interactables, ...blueprint.design.npcs]) sprites[item.id] = "x.png";
  return { blueprint, layout: buildWorldLayout(blueprint, sprites) };
}

for (const id of TEMPLATE_IDS) {
  test(`${id}: a complete, walkable, valid world`, () => {
    const { blueprint, layout } = build(id, id === "plaza" ? "plaza" : id === "garden" ? "park" : "street");
    const { world, spawn, exit, foodTile } = layout;
    assert.equal(world.ground.length, WORLD_ROWS);
    assert.ok(world.ground.every((row) => row.length === WORLD_COLS && /^[gfpcrkw]+$/.test(row)));
    assert.ok(exitReachable(world, spawn, exit), "exit reachable");
    assert.deepEqual(inspectWorld(world, spawn, exit), [], "inspector finds nothing wrong");
    assert.equal(world.objects.filter((o) => o.id.startsWith("building_")).length, 3);
    assert.equal(world.objects.filter((o) => o.role).length, blueprint.design!.interactables.length + blueprint.design!.npcs.length, "every designed thing is placed");
    for (const prop of blueprint.props) assert.ok(world.objects.some((o) => o.id === prop.id), `photographed prop ${prop.id} is placed`);
    const reach = reachableCells(world, { x: Math.round(tileFeet(spawn).x / 8) * 8, y: Math.round(tileFeet(spawn).y / 8) * 8 });
    const near = (t: { x: number; y: number }) => [...reach].some((k) => { const [x, y] = k.split(",").map(Number); return Math.hypot(x - tileFeet(t).x, y - tileFeet(t).y) < 28; });
    assert.ok(near(foodTile), "the lunch table can be approached");
    for (const b of world.objects.filter((o) => o.id.startsWith("building_"))) assert.ok(near({ x: Math.floor(b.x / 16), y: Math.floor((b.y + 24) / 16) }), `${b.name} entrance reachable`);
    const manifest: DayManifest = { id: "t", date: "2026-11-01", player: { name: "T", sprite: "p.png" }, transit: [],
      scenes: [{ kind: "tourist", title: "T", time: "12:00", base: "street", world, spawn, exit, landmarks: [], food: { tile: foodTile, sprite: "f.png", text: "Lunch" } }] };
    assert.equal(parseDayManifest(manifest, "t"), manifest);
  });

  test(`${id}: every named zone is real, on the map and usable`, () => {
    const template = TEMPLATES[id];
    const { layout } = build(id);
    const reach = [...reachableCells(layout.world, { x: Math.round(tileFeet(layout.spawn).x / 8) * 8, y: Math.round(tileFeet(layout.spawn).y / 8) * 8 })].map((k) => k.split(",").map(Number));
    assert.equal(new Set(template.zones.map((z) => z.id)).size, template.zones.length, "zone ids are unique");
    for (const z of template.zones) {
      assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.width <= WORLD_COLS * 16 && z.y + z.height <= WORLD_ROWS * 16, `${z.id} is on the map`);
      assert.ok(reach.some(([x, y]) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height), `${z.id} contains somewhere a person can stand`);
    }
  });
}

test("only the street has a crossing and road markings", () => {
  assert.ok(build("street").layout.world.crossing);
  for (const id of ["garden", "plaza", "riverside"] as const) assert.equal(build(id).layout.world.crossing, undefined);
});

test("water exists only where the template puts it, and nothing is placed on it", () => {
  for (const id of ["garden", "riverside"] as const) {
    const { layout } = build(id);
    assert.ok(layout.world.ground.some((row) => row.includes("w")), `${id} has water`);
    for (const o of layout.world.objects) assert.notEqual(layout.world.ground[Math.floor(o.y / 16)][Math.floor(o.x / 16)], "w", `${o.id} is not in the water`);
  }
});

test("the same inputs always build the same world", () => {
  for (const id of TEMPLATE_IDS) assert.deepEqual(build(id).layout, build(id).layout);
});
