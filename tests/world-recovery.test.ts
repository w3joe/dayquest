import assert from "node:assert/strict";
import test from "node:test";
import { furnitureBlock, buildWorldKit, WORLD_KIT_REVISION } from "../lib/world-kit";
import { blockFitsGround } from "../game/block-placement";
import { buildWorldLayout, exitReachable } from "../game/world-layout";
import { parseDayManifest } from "../lib/day";
import { offlineInteractionPlan } from "../pipeline/interaction-plan";
import { mockScenePlan, normalizeScenePlan } from "../pipeline/scene-plan";
import { prepareWorldConstruction } from "../pipeline/world-construction";
import { advanceWorldBuild, type WorldBuildDependencies, type WorldCheckpoint } from "../pipeline/world-build";
import { fallbackDesign } from "../pipeline/world-design";

function failedCheckpoint(): WorldCheckpoint {
  const blueprint = mockScenePlan({ landmark: Buffer.from("fixture"), lunch: Buffer.from("fixture") });
  blueprint.template = "street";
  blueprint.design = fallbackDesign("street");
  blueprint.props = [
    { id: "prop_0", name: "Photographed bridge", description: "An arched bridge from the supplied photograph.", usage: { area: "roadside", purpose: "Connects the river banks." } },
    { id: "prop_1", name: "Photographed boat", description: "A passenger boat from the supplied photograph.", usage: { area: "waterfront", purpose: "Part of the photographed river scene." } },
    { id: "prop_2", name: "Tree", description: "A tree", library: "tree", usage: { area: "greenery", near: "building_2", purpose: "Greenery near the building." } },
    { id: "prop_3", name: "Lamp", description: "A lamp", library: "lamp", usage: { area: "roadside", purpose: "Light beside the road." } },
  ];
  blueprint.kit = buildWorldKit(blueprint);
  delete blueprint.kit.revision;
  blueprint.kit.blocks.find(block => block.id === "prop_0")!.allowedGround = [];
  return { blueprint, assets: Object.fromEntries(["building_0", "building_1", "building_2", "prop_0", "prop_1", "food", "player_walk"].map(id => [id, `${id}.png`])) };
}

test("roadside means safe pavement for structures and lamps while vehicles retain road-only feet", () => {
  const ground = Array.from({ length: 5 }, () => "pppppp");
  for (const kind of ["custom", "lamp"]) {
    const block = furnitureBlock("object", "Object", kind, { area: "roadside", purpose: "Beside a route." });
    assert.ok(block.allowedGround.length);
    assert.equal(blockFitsGround(block, ground, 40, 47), true);
  }
  assert.equal(blockFitsGround(furnitureBlock("car", "Car", "car_red"), ground, 40, 47), false);
});

test("legacy waterfront evidence selects a water-bearing template and preserves every generated asset", () => {
  const checkpoint = failedCheckpoint();
  const original = structuredClone(checkpoint);
  const blueprint = prepareWorldConstruction(checkpoint.blueprint!);
  assert.equal(blueprint.template, "riverside");
  assert.equal(blueprint.kit!.revision, WORLD_KIT_REVISION);
  assert.deepEqual(blueprint.props, original.blueprint!.props);
  const layout = buildWorldLayout(blueprint, checkpoint.assets);
  assert.ok(layout.world.ground.some(row => row.includes("w")));
  for (const id of ["prop_0", "prop_1"]) assert.equal(layout.world.objects.find(object => object.id === id)!.sprite, checkpoint.assets[id]);
  assert.ok(exitReachable(layout.world, layout.spawn, layout.exit));
  assert.deepEqual(checkpoint, original, "repair must not mutate the saved inventory or completed sprites");
});

test("Continue Building upgrades the failed seven-sprite checkpoint and publishes without a photo or image request", async () => {
  const checkpoint = failedCheckpoint(), before = structuredClone(checkpoint);
  const writes = new Map<string, Buffer>();
  let plannedInteractions = 0;
  const deps: WorldBuildDependencies = {
    async plan() { throw Error("must not re-analyse the photos"); },
    images: { live: false, async generate() { throw Error("must not regenerate completed artwork"); } },
    async planInteractions(scene) { plannedInteractions++; return offlineInteractionPlan(scene); },
    store: { manifestUrl: "/days/recovered-world/day.json", async put(name, bytes) { writes.set(name, bytes); } },
  };
  const input = { id: "recovered-world", date: "2026-11-01", name: "You", uploads: {}, player: Buffer.from("accepted character fixture") };
  const interactions = await advanceWorldBuild(input, checkpoint, deps);
  assert.equal(interactions.checkpoint.blueprint!.template, "riverside");
  assert.ok(interactions.checkpoint.interactionPack);
  assert.deepEqual(interactions.checkpoint.assets, before.assets);
  const done = await advanceWorldBuild(input, JSON.parse(JSON.stringify(interactions.checkpoint)), deps);
  assert.equal(plannedInteractions, 1);
  assert.ok(done.manifest);
  parseDayManifest(done.manifest, input.id);
  assert.deepEqual([...writes.keys()].sort(), ["day.json", "player.png", "world-kit.json"]);
  assert.equal(writes.get("player.png")!.toString(), "accepted character fixture");
  assert.deepEqual(checkpoint, before);
});

test("unavailable placement affinity relaxes with recorded context while retaining dry feet, source art and a reachable exit", () => {
  const plan = mockScenePlan();
  plan.composition = { ground: [], features: [] };
  plan.props = [{ id: "detail", name: "Photo detail", description: "Distinctive photographed object.", usage: { area: "waterfront", purpose: "Prefers a shore." } }];
  const assets = { building_0: "b0.png", building_1: "b1.png", building_2: "b2.png", detail: "photo-detail.png" };
  const layout = buildWorldLayout(plan, assets);
  assert.equal(layout.world.objects.find(object => object.id === "detail")!.sprite, "photo-detail.png");
  const resolved = layout.blockContexts.detail;
  assert.equal(resolved.requestedUsage!.area, "waterfront");
  assert.equal(resolved.usage.area, "open");
  assert.ok(resolved.placementNote);
  assert.ok(exitReachable(layout.world, layout.spawn, layout.exit));
});

test("vision can name a riverside template directly and malformed templates are rejected", () => {
  const raw = mockScenePlan();
  assert.equal(normalizeScenePlan({ ...raw, template: "riverside" }, {}).template, "riverside");
  assert.throws(() => normalizeScenePlan({ ...raw, template: "anything" }, {}), /scene template/);
});
