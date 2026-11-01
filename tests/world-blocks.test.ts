import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldKit, furnitureBlock, parseBlockUsage } from "../lib/world-kit";
import { blockFitsGround } from "../game/block-placement";
import { buildingAnchors, buildWorldLayout, exitReachable } from "../game/world-layout";
import { TEMPLATE_IDS, TEMPLATES } from "../game/layout-templates";
import { sceneReachableTiles, type DayScene } from "../lib/day";
import { buildSceneAssetJobs } from "../pipeline/scene-assets";
import { mockScenePlan, normalizeScenePlan, SCENE_PLAN_SCHEMA } from "../pipeline/scene-plan";
import { advanceWorldBuild, type WorldBuildDependencies, type WorldCheckpoint } from "../pipeline/world-build";

const sprites = { building_0: "building_0.png", building_1: "building_1.png", building_2: "building_2.png", photo_sign: "photo_sign.png", food: "food.png", player_walk: "player_walk.png" };

test("construction usage validates model relationships and provides defaults for old inventories", () => {
  const use = parseBlockUsage({ area: "frontage", purpose: "  Sign beside the cafe  ", near: "building_1" }, { area: "open", purpose: "Fallback" });
  assert.equal(use.purpose, "Sign beside the cafe");
  for (const value of [null, { ...use, area: "anywhere" }, { ...use, near: "missing-building" }, { ...use, purpose: "" }]) assert.throws(() => parseBlockUsage(value, use));
  const plan = mockScenePlan();
  assert.ok(plan.buildings.every(building => building.usage?.area === "frontage"));
  assert.equal(plan.props.find(prop => prop.library === "tree")?.usage?.area, "greenery");
  assert.ok(SCENE_PLAN_SCHEMA.properties.props.items.required.includes("usage"));
  const invalid = { ...plan, buildings: plan.buildings.map((building, index) => index ? building : { ...building, usage: use }) };
  assert.throws(() => normalizeScenePlan(invalid, {}), /building block usage/);
});

test("all independently generated blocks receive the same world direction and their own assembly contract", () => {
  const plan = mockScenePlan({ landmark: Buffer.from("location"), lunch: Buffer.from("lunch") });
  plan.buildings[0].observed = true;
  plan.props = [{ id: "photo_sign", name: "Blue sign", description: "A blue sign in the photo.", usage: { area: "frontage", near: "building_1", purpose: "Marks the shop entrance." } }];
  const photo = Buffer.from("actual photo"), style = Buffer.from("style only"), lunch = Buffer.from("actual lunch"), player = Buffer.from("accepted character");
  const jobs = buildSceneAssetJobs(plan, { uploads: { landmark: photo, lunch }, player, styleReferences: [style] });
  const kit = buildWorldKit(plan);
  for (const job of jobs) {
    assert.ok(job.block);
    assert.ok(job.prompt.includes(kit.style.light));
    assert.ok(job.prompt.includes(kit.style.scale));
    assert.match(job.prompt, /reusable transparent cutout/);
    assert.equal(job.block.id, job.id);
  }
  const sign = jobs.find(job => job.id === "photo_sign")!;
  assert.equal(sign.block!.usage.near, "building_1");
  assert.match(sign.prompt, /Marks the shop entrance/);
  assert.equal(sign.references[0], photo);
  assert.equal(jobs[0].references[0], photo);
  assert.equal(jobs.find(job => job.id === "food")!.references[0], lunch);
  assert.equal(jobs.find(job => job.id === "player_walk")!.references[0], player);
});

test("context groups photographed props by their building and retains continuous reachable entrances on every template", () => {
  for (const template of TEMPLATE_IDS) {
    const plan = mockScenePlan({ landmark: Buffer.from("location") });
    plan.template = template; plan.ground = TEMPLATES[template].grounds[0];
    plan.props = [{ id: "photo_sign", name: "Blue sign", description: "A photographed shop sign.", usage: { area: "frontage", near: "building_2", purpose: "Marks this entrance." } }];
    const layout = buildWorldLayout(plan, sprites);
    const sign = layout.world.objects.find(object => object.id === "photo_sign")!;
    assert.ok(sign, template);
    assert.equal(sign.sprite, "photo_sign.png");
    assert.ok(Math.abs(sign.x - 528) < 100, `${template}: sign belongs to the requested building, not a generic slot`);
    assert.ok("pc".includes(layout.world.ground[Math.floor(sign.y / 16)][Math.floor(sign.x / 16)]));
    assert.equal(layout.blockContexts.photo_sign.usage.near, "building_2");
    assert.ok(exitReachable(layout.world, layout.spawn, layout.exit));
    const scene: DayScene = { kind: "tourist", base: "street", time: "12:00", title: "Test", landmarks: [], ...layout };
    const reachable = sceneReachableTiles(scene);
    for (const anchor of buildingAnchors(plan)) {
      assert.ok(reachable.has(`${Math.floor(anchor.front.x / 16)},11`), `${template}: clear doorway approach`);
      assert.ok("pc".includes(layout.world.ground[10][Math.floor(anchor.front.x / 16)]));
    }
  }
});

test("placement checks the entire foot on compatible ground and shared trees cannot be reclassified onto roads", () => {
  const rows = ["gggg", "gppg", "grrg", "gggg"];
  const car = furnitureBlock("car", "Car", "car_red");
  assert.equal(blockFitsGround(car, rows, 32, 47), true);
  assert.equal(blockFitsGround(car, rows, 32, 31), false);
  const tree = furnitureBlock("tree", "Tree", "tree", { area: "roadside", purpose: "Invalid request" });
  assert.equal(blockFitsGround(tree, rows, 32, 47), false);
  const prop = furnitureBlock("sign", "Sign", "custom", { area: "open", purpose: "A sign" });
  assert.equal(blockFitsGround(prop, ["ppww", "ppww", "ppww"], 30, 31), false, "a dry anchor must not hide a footprint crossing into water");
});

test("the published reusable kit records actual assembly and a failed kit write retries without redrawing", async () => {
  const plan = mockScenePlan(); plan.kit = buildWorldKit(plan);
  const checkpoint: WorldCheckpoint = { blueprint: plan, assets: sprites };
  let failKit = true;
  const saved = new Map<string, Buffer>();
  const deps: WorldBuildDependencies = {
    async plan() { throw new Error("must not replan"); },
    images: { live: false, async generate() { throw new Error("must not redraw accepted blocks"); } },
    store: { manifestUrl: "/days/kit-test/day.json", async put(name, bytes) {
      if (name === "world-kit.json" && failKit) { failKit = false; throw new Error("temporary kit storage failure"); }
      saved.set(name, bytes);
    } },
  };
  const input = { id: "kit-test", date: "2026-11-01", name: "You", uploads: {}, player: Buffer.from("accepted character") };
  await assert.rejects(advanceWorldBuild(input, checkpoint, deps), /temporary kit storage failure/);
  assert.equal(saved.has("day.json"), false);
  const result = await advanceWorldBuild(input, checkpoint, deps);
  const kit = JSON.parse(saved.get("world-kit.json")!.toString());
  assert.equal(kit.version, 1);
  assert.ok(kit.blocks.length);
  for (const object of result.manifest!.scenes[0].world!.objects) {
    const block = kit.blocks.find((candidate: { id: string }) => candidate.id === object.id);
    assert.equal(block.sprite, object.sprite);
    assert.deepEqual(block.placement.collision, object.collision);
    assert.equal(block.render.width, object.width);
    assert.ok(block.usage.purpose);
  }
  assert.equal(kit.character.sprite, "player.png");
  assert.equal(kit.character.walkSheet, sprites.player_walk);
  assert.equal(saved.get("player.png")!.toString(), "accepted character");
});
