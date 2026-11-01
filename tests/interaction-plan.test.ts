import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldLayout } from "../game/world-layout";
import type { DayScene } from "../lib/day";
import type { InteractionCatalog } from "../lib/interactions";
import { interactionCatalogFingerprint, loadInteractionCatalog } from "../lib/server/interaction-catalog";
import { worldJobId } from "../lib/server/world-jobs";
import { interactionPlanSchema, offlineInteractionPlan, planSceneInteractions, type InteractionPlannerClient } from "../pipeline/interaction-plan";
import { mockScenePlan } from "../pipeline/scene-plan";
import { advanceWorldBuild, type WorldBuildDependencies, type WorldCheckpoint } from "../pipeline/world-build";

function completeScene() {
  const blueprint = mockScenePlan({ lunch: Buffer.from("test fixture") });
  blueprint.food = { name: "Tomato sandwich", description: "Two slices of seeded bread with red tomato and green leaves.", text: "A quiet pause halfway through the day." };
  const assets = { building_0: "building_0.png", building_1: "building_1.png", building_2: "building_2.png", food: "food.png", player_walk: "player_walk.png" };
  const layout = buildWorldLayout(blueprint, assets);
  const scene: DayScene = { kind: "tourist", title: blueprint.title, base: "street", time: "12:00", landmarks: [],
    spawn: layout.spawn, exit: layout.exit, world: layout.world, food: { sprite: "food.png", tile: layout.foodTile, ...blueprint.food } };
  return { blueprint, assets, scene };
}

const catalog: InteractionCatalog = { version: 1, assets: [
  { id: "sample_pose", src: "/interactions/library/sample-pose-v1.png", kind: "pose", width: 32, height: 48 },
  { id: "sample_prop", src: "/interactions/library/sample-prop-v1.png", kind: "prop", width: 16, height: 16 },
] };

test("empty catalogue produces only grounded text inspection without any API request", async () => {
  const { scene } = completeScene();
  let calls = 0;
  const fake: InteractionPlannerClient = { responses: { async create() { calls++; throw new Error("must not call a provider"); } } };
  const pack = await planSceneInteractions(scene, { version: 1, assets: [] }, fake);
  assert.equal(calls, 0);
  assert.equal(pack.catalog.assets.length, 0);
  assert.ok(pack.actions.length > 0);
  for (const action of pack.actions) {
    assert.ok(action.targetId === "food" || scene.world!.objects.some(object => object.id === action.targetId));
    assert.deepEqual(action.steps.map(step => step.type), ["say"]);
  }
  assert.ok(pack.actions.find(action => action.targetId === "food"));
});

test("live interaction adapter sends only supplied inventory and validates structured action references", async () => {
  const { scene } = completeScene();
  const proposal = { actions: [{ id: "look_bricks", targetId: "building_0", label: "Look at the brickwork", repeatable: true,
    steps: [{ type: "say", text: "The warm brickwork catches the light." }] }] };
  let calls = 0;
  const fake: InteractionPlannerClient = { responses: { async create(request) {
    calls++;
    assert.equal(request.text?.format?.type, "json_schema");
    assert.equal((request.text?.format as { strict?: boolean }).strict, true);
    const input = JSON.stringify(request.input);
    assert.match(input, /building_0/);
    assert.match(input, /sample_pose/);
    assert.match(input, /removable/);
    const supplied = JSON.parse((request.input as { content: string }[])[0].content);
    assert.equal(supplied.scene.food.name, "Tomato sandwich");
    assert.equal(supplied.scene.food.description, "Two slices of seeded bread with red tomato and green leaves.");
    assert.equal(supplied.scene.food.text, "A quiet pause halfway through the day.");
    assert.equal(supplied.scene.food.consumable, true);
    assert.equal(supplied.scene.food.removable, true);
    assert.doesNotMatch(input, /api_key|data:image|fit-front/);
    return { status: "completed", output_text: JSON.stringify(proposal) };
  } } };
  const pack = await planSceneInteractions(scene, catalog, fake);
  assert.equal(calls, 1);
  assert.equal(pack.actions[0].targetId, "building_0");
  assert.equal(pack.actions[0].label, proposal.actions[0].label);
  assert.deepEqual(pack.catalog, catalog);
  const invalid = { responses: { async create() { return { output_text: JSON.stringify({ actions: [{ ...proposal.actions[0], steps: [{ type: "animate", assetId: "invented_sprite", durationMs: 500 }] }] }) }; } } };
  await assert.rejects(planSceneInteractions(scene, catalog, invalid), /unsupported action or asset/);
  const hideBuilding = { responses: { async create() { return { output_text: JSON.stringify({ actions: [{ ...proposal.actions[0], steps: [{ type: "setObject", state: "hidden" }] }] }) }; } } };
  await assert.rejects(planSceneInteractions(scene, catalog, hideBuilding), /unsupported action or asset/);
  await assert.rejects(planSceneInteractions(scene, catalog, { responses: { async create() { return { status: "incomplete", output_text: JSON.stringify(proposal) }; } } }), /did not complete/);
});

test("planner schema capability lists cannot name unsupported asset kinds or scene targets", () => {
  const schema = JSON.stringify(interactionPlanSchema(completeScene().scene, catalog));
  assert.match(schema, /sample_pose/);
  assert.match(schema, /sample_prop/);
  assert.doesNotMatch(schema, /sample-pose-v1\.png/);
  const empty = JSON.stringify(interactionPlanSchema(completeScene().scene, { version: 1, assets: [] }));
  assert.doesNotMatch(empty, /"animate"|"attach"/);
});

function mixedReachabilityScene(): DayScene {
  const ground = Array.from({ length: 15 }, (_, y) => Array.from({ length: 20 }, (_, x) => x <= 6 && y <= 6 ? "w" : "p").join(""));
  const scene: DayScene = { kind: "tourist", title: "Reachable street", time: "12:00", base: "street", spawn: { x: 10, y: 12 }, exit: { x: 19, y: 12 }, landmarks: [],
    world: { width: 20, height: 15, ground, objects: [
      { id: "isolated", name: "Island sculpture", text: "Across the water.", sprite: "sculpture.png", x: 48, y: 48, width: 16, height: 16, collision: { x: 40, y: 40, width: 16, height: 8 } },
      { id: "accessible", name: "Street sign", text: "A readable sign.", sprite: "sign.png", x: 160, y: 180, width: 16, height: 16, collision: { x: 152, y: 172, width: 16, height: 8 } },
    ] } };
  return scene;
}

test("offline inspection skips an unreachable decorative prop without dropping reachable actions", () => {
  const pack = offlineInteractionPlan(mixedReachabilityScene());
  assert.deepEqual(pack.actions.map(action => action.targetId), ["accessible"]);
});

test("live planning excludes unreachable targets from both model inventory and strict enum", async () => {
  const scene = mixedReachabilityScene();
  scene.world!.objects.find(object => object.id === "accessible")!.removable = true;
  let calls = 0;
  const fake: InteractionPlannerClient = { responses: { async create(request) {
    calls++;
    const input = JSON.stringify(request.input);
    const schema = JSON.stringify(request.text?.format);
    assert.match(input, /accessible/);
    assert.match(schema, /accessible/);
    assert.doesNotMatch(input, /isolated|Island sculpture/);
    assert.doesNotMatch(schema, /isolated/);
    const supplied = JSON.parse((request.input as { content: string }[])[0].content);
    assert.equal(supplied.scene.objects[0].removable, true);
    return { output_text: JSON.stringify({ actions: [{ id: "read_sign", targetId: "accessible", label: "Read the sign", repeatable: true,
      steps: [{ type: "say", text: "A readable street sign." }] }] }) };
  } } };
  const pack = await planSceneInteractions(scene, catalog, fake);
  assert.equal(calls, 1);
  assert.equal(pack.actions[0].targetId, "accessible");
});

test("no reachable target returns an empty pack without a model call or empty schema enum", async () => {
  const scene = mixedReachabilityScene();
  scene.world!.objects = scene.world!.objects.filter(object => object.id === "isolated");
  let calls = 0;
  const pack = await planSceneInteractions(scene, catalog, { responses: { async create() { calls++; throw new Error("no eligible targets"); } } });
  assert.equal(calls, 0);
  assert.deepEqual(pack.actions, []);
  assert.doesNotMatch(JSON.stringify(interactionPlanSchema(scene, catalog)), /"enum":\[\]/);
});

test("interaction plan checkpoints before publication and is reused when final storage fails", async () => {
  const { blueprint, assets } = completeScene();
  const input = { id: "interactions-resume", date: "2026-11-01", name: "You", uploads: {}, player: Buffer.from("accepted character fixture") };
  let planned = 0, failPublication = true;
  const writes: string[] = [];
  const deps: WorldBuildDependencies = {
    async plan() { throw new Error("completed inventory must not be replanned"); },
    images: { live: false, async generate() { throw new Error("completed sprites must not regenerate"); } },
    store: { manifestUrl: "/days/interactions-resume/day.json", async put(name) {
      writes.push(name);
      if (name === "day.json" && failPublication) { failPublication = false; throw new Error("fixture publication failure"); }
    } },
    async planInteractions(scene) { planned++; return offlineInteractionPlan(scene); },
  };
  const original: WorldCheckpoint = { blueprint, assets };
  const interactionStep = await advanceWorldBuild(input, original, deps);
  assert.equal(interactionStep.manifest, undefined);
  assert.equal(planned, 1);
  assert.ok(interactionStep.checkpoint.interactionPack);
  assert.equal(original.interactionPack, undefined, "checkpoint input is immutable");
  assert.deepEqual(writes, [], "no publication before the interaction checkpoint is persisted");
  const saved: WorldCheckpoint = JSON.parse(JSON.stringify(interactionStep.checkpoint));
  await assert.rejects(advanceWorldBuild(input, saved, deps), /fixture publication failure/);
  const result = await advanceWorldBuild(input, saved, deps);
  assert.equal(planned, 1);
  assert.deepEqual(result.manifest?.scenes[0].interactionPack, saved.interactionPack);
  assert.equal(result.manifest?.scenes[0].food?.name, blueprint.food!.name);
  assert.equal(result.manifest?.scenes[0].food?.description, blueprint.food!.description);
  assert.equal(result.manifest?.scenes[0].food?.text, blueprint.food!.text);
});

test("invalid injected interaction planning cannot poison the persisted build checkpoint", async () => {
  const { blueprint, assets } = completeScene();
  const checkpoint: WorldCheckpoint = { blueprint, assets };
  let writes = 0;
  const deps: WorldBuildDependencies = {
    async plan() { throw new Error("not needed"); },
    images: { live: false, async generate() { throw new Error("not needed"); } },
    store: { manifestUrl: "/fixture/day.json", async put() { writes++; } },
    async planInteractions(scene) {
      const pack = offlineInteractionPlan(scene);
      pack.actions[0].targetId = "invented_target";
      return pack;
    },
  };
  await assert.rejects(advanceWorldBuild({ id: "invalid-pack", date: "2026-11-01", name: "You", uploads: {}, player: Buffer.from("fixture") }, checkpoint, deps), /unknown object target/);
  assert.equal(checkpoint.interactionPack, undefined);
  assert.equal(writes, 0);
});

test("fixed catalogue fingerprints and world identities change with supplied catalogue bytes", () => {
  const loaded = loadInteractionCatalog();
  assert.equal(loaded.catalog.version, 1);
  assert.ok(Array.isArray(loaded.catalog.assets));
  assert.match(loaded.fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(interactionCatalogFingerprint('{"version":1,"assets":[]}'), interactionCatalogFingerprint('{"version":1,"assets":[]}\n'));
  const draft = { sessionId: "b8dcc7ca-3926-405f-a375-b6a05b0e6d46", spriteUrl: "/player.png", uploads: [{ kind: "fit" as const, url: "/fit.png" }] };
  assert.equal(worldJobId(draft, "catalog-version-a"), worldJobId(draft, "catalog-version-a"));
  assert.notEqual(worldJobId(draft, "catalog-version-a"), worldJobId(draft, "catalog-version-b"));
});


test("supporting NPC dialogue and cosmetic objects keep their authored interactions", async () => {
  const scene = mixedReachabilityScene();
  const sign = scene.world!.objects.find(object => object.id === "accessible")!;
  scene.world!.objects.push(
    { ...sign, id: "neighbor", name: "Friendly neighbor", role: "npc", lines: ["A lovely day."], roam: 0 },
    { ...sign, id: "bell", name: "Door bell", role: "interactable", effect: "ring" },
  );
  const targets = offlineInteractionPlan(scene).actions.map(action => action.targetId);
  assert.deepEqual(targets, ["accessible"]);
  const schema = JSON.stringify(interactionPlanSchema(scene, catalog));
  assert.doesNotMatch(schema, /neighbor|bell/);
  let calls = 0;
  await planSceneInteractions(scene, catalog, { responses: { async create(request) {
    calls++;
    assert.doesNotMatch(JSON.stringify(request.input), /neighbor|Door bell/);
    return { output_text: JSON.stringify({ actions: [] }) };
  } } });
  assert.equal(calls, 1);
  await assert.rejects(planSceneInteractions(scene, catalog, { responses: { async create() {
    return { output_text: JSON.stringify({ actions: [{ id: "override_neighbor", targetId: "neighbor", label: "Look", repeatable: true, steps: [{ type: "say", text: "Generic inspection." }] }] }) };
  } } }), /unsupported action or asset/);
});
