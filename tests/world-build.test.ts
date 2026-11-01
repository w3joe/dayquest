import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { ReadyDraft } from "../lib/draft";
import { parseDayManifest } from "../lib/day";
import { publicWorldJob, worldJobId } from "../lib/server/world-jobs";
import type { WorldJob } from "../lib/world-job";
import { mockScenePlan } from "../pipeline/scene-plan";
import { advanceWorldAssetBatch, advanceWorldBuild, type WorldBuildInput, type WorldBuildDependencies, type WorldCheckpoint } from "../pipeline/world-build";

async function fixtures() {
  const width = 96, height = 192, data = Buffer.alloc(width * height * 4);
  for (let frame = 0; frame < 12; frame++) {
    for (let y = 8; y < 40; y++) for (let x = 9; x < 23; x++) {
      const index = (((Math.floor(frame / 3) * 48 + y) * width) + frame % 3 * 32 + x) * 4;
      data[index] = 80 + frame * 8; data[index + 1] = 120; data[index + 2] = 80; data[index + 3] = 255;
    }
  }
  const sheet = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const sprite = await sharp(sheet).extract({ left: 0, top: 0, width: 32, height: 48 }).png().toBuffer();
  return { sheet, sprite };
}

async function harness() {
  const { sheet, sprite } = await fixtures();
  const input: WorldBuildInput = { id: "build-test", date: "2026-11-01", name: "You", uploads: { landmark: sprite, fit: sprite }, player: sprite };
  const calls: string[] = [], writes: string[] = [], saved = new Map<string, Buffer>();
  let plans = 0, failGeneration = "", failStore = "";
  const deps: WorldBuildDependencies = {
    plan: async photoInput => {
      plans++;
      assert.equal(photoInput.landmark, input.uploads.landmark);
      assert.deepEqual(photoInput.context, { name: "You", date: input.date });
      return mockScenePlan(photoInput);
    },
    images: { live: false, async generate(request) {
      calls.push(request.name);
      if (failGeneration === request.name) { failGeneration = ""; throw { code: "credit_balance_exhausted", status: 400 }; }
      return request.kind === "player" ? sheet : sprite;
    } },
    store: { manifestUrl: "/days/build-test/day.json", async put(name, bytes) {
      writes.push(name);
      if (failStore === name) { failStore = ""; throw new Error("Temporary storage failure"); }
      saved.set(name, bytes);
    } },
  };
  return { input, deps, calls, writes, saved, plans: () => plans,
    failGeneration(name: string) { failGeneration = name; }, failStore(name: string) { failStore = name; } };
}

test("world build saves one unit per advance and resumes successful sprites without an early manifest", async () => {
  const h = await harness();
  let checkpoint: WorldCheckpoint = { assets: {} };
  const initial = checkpoint;
  const planned = await advanceWorldBuild(h.input, checkpoint, h.deps);
  checkpoint = planned.checkpoint;
  assert.equal(h.plans(), 1);
  assert.equal(planned.total, 4);
  assert.deepEqual(initial, { assets: {} }, "caller checkpoint must remain immutable");
  assert.equal(h.calls.length, 0);
  assert.equal(h.writes.length, 0);
  for (let asset = 0; asset < planned.total; asset++) {
    const previous = checkpoint;
    const result = await advanceWorldBuild(h.input, checkpoint, h.deps);
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); // Simulate server restart/read from persistent storage.
    assert.equal(result.manifest, undefined);
    assert.equal(Object.keys(previous.assets).length, asset);
    assert.equal(Object.keys(checkpoint.assets).length, asset + 1);
    assert.equal(h.calls.length, asset + 1);
    assert.equal(h.saved.has("day.json"), false);
  }
  const completed = await advanceWorldBuild(h.input, checkpoint, h.deps);
  assert.equal(completed.event.step, "done");
  assert.equal(h.plans(), 1, "resume must not analyse photos again");
  assert.equal(h.calls.length, 4, "final publication must not regenerate sprites");
  const manifest = parseDayManifest(JSON.parse(h.saved.get("day.json")!.toString()), h.input.id);
  assert.deepEqual(manifest, JSON.parse(JSON.stringify(completed.manifest)));
  assert.equal(manifest.player.walkSheet, "player_walk.png");
  assert.equal(manifest.scenes.length, 1);
  assert.equal(manifest.transit.length, 0);
  for (const object of manifest.scenes[0].world!.objects) {
    if (!object.sprite.startsWith("/")) assert.ok(h.saved.has(object.sprite), `published sprite ${object.sprite}`);
  }
  assert.deepEqual(h.writes.slice(-2), ["player.png", "day.json"]);
});

test("failed generation retries only the failed asset and retains completed inventory and artwork", async () => {
  const h = await harness();
  let checkpoint = (await advanceWorldBuild(h.input, { assets: {} }, h.deps)).checkpoint;
  checkpoint = (await advanceWorldBuild(h.input, checkpoint, h.deps)).checkpoint;
  const before = structuredClone(checkpoint);
  const firstBytes = h.saved.get("building_0.png");
  h.failGeneration(checkpoint.blueprint!.buildings[1].name);
  await assert.rejects(advanceWorldBuild(h.input, checkpoint, h.deps), /credits or quota are exhausted/);
  assert.deepEqual(checkpoint, before);
  assert.equal(h.saved.has("day.json"), false);
  assert.equal(h.saved.has("building_1.png"), false);
  const retried = await advanceWorldBuild(h.input, checkpoint, h.deps);
  checkpoint = retried.checkpoint;
  assert.equal(h.calls.filter(name => name === checkpoint.blueprint!.buildings[0].name).length, 1);
  assert.equal(h.calls.filter(name => name === checkpoint.blueprint!.buildings[1].name).length, 2);
  assert.equal(h.saved.get("building_0.png"), firstBytes);
  assert.deepEqual(Object.keys(checkpoint.assets), ["building_0", "building_1"]);
  assert.equal(h.plans(), 1);
});

test("failed storage is never marked complete and failed final publication can resume without image calls", async () => {
  const h = await harness();
  let checkpoint = (await advanceWorldBuild(h.input, { assets: {} }, h.deps)).checkpoint;
  h.failStore("building_0.png");
  await assert.rejects(advanceWorldBuild(h.input, checkpoint, h.deps), /Temporary storage failure/);
  assert.deepEqual(checkpoint.assets, {});
  assert.equal(h.saved.has("building_0.png"), false);
  for (let n = 0; n < 4; n++) checkpoint = (await advanceWorldBuild(h.input, checkpoint, h.deps)).checkpoint;
  h.failStore("day.json");
  await assert.rejects(advanceWorldBuild(h.input, checkpoint, h.deps), /Temporary storage failure/);
  assert.equal(h.saved.has("day.json"), false);
  const calls = h.calls.length;
  const result = await advanceWorldBuild(h.input, JSON.parse(JSON.stringify(checkpoint)), h.deps);
  assert.ok(result.manifest);
  assert.equal(h.calls.length, calls);
  assert.equal(h.plans(), 1);
});

test("photographed food and custom props publish only after all of their sprites are stored", async () => {
  const h = await harness();
  h.input.uploads.lunch = h.input.player;
  const plan = h.deps.plan;
  h.deps.plan = async input => {
    const blueprint = await plan(input);
    blueprint.props.push({ id: "prop_3", name: "Blue sculpture", description: "A small blue sculpture." });
    return blueprint;
  };
  const planned = await advanceWorldBuild(h.input, { assets: {} }, h.deps);
  assert.equal(planned.total, 6);
  let checkpoint = planned.checkpoint;
  for (let n = 0; n < planned.total; n++) {
    checkpoint = (await advanceWorldBuild(h.input, checkpoint, h.deps)).checkpoint;
    assert.equal(h.saved.has("day.json"), false);
  }
  const result = await advanceWorldBuild(h.input, checkpoint, h.deps);
  assert.equal(result.manifest?.scenes[0].food?.sprite, "food.png");
  assert.ok(h.saved.has("food.png"));
  const sculpture = result.manifest!.scenes[0].world!.objects.find(object => object.id === "prop_3");
  assert.equal(sculpture?.sprite, "prop_3.png");
  assert.ok(h.saved.has("prop_3.png"));
});

test("world job IDs are stable across upload order and change when photos or accepted character change", () => {
  const draft: ReadyDraft = { sessionId: "b8dcc7ca-3926-405f-a375-b6a05b0e6d46", spriteUrl: "https://example.com/player.png",
    uploads: [{ kind: "fit", url: "https://example.com/fit.png" }, { kind: "landmark", url: "https://example.com/landmark.png" }] };
  const id = worldJobId(draft);
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(worldJobId({ ...draft, uploads: [...draft.uploads].reverse() }), id);
  assert.notEqual(worldJobId({ ...draft, spriteUrl: "https://example.com/player-new.png" }), id);
  assert.notEqual(worldJobId({ ...draft, uploads: [...draft.uploads, { kind: "lunch", url: "https://example.com/lunch.png" }] }), id);
});

test("public job projection excludes source/checkpoint/lease details", () => {
  const state: WorldJob & { checkpoint: WorldCheckpoint; leaseUntil: number; date: string } = {
    id: "a".repeat(32), status: "running", completed: 1, total: 4, updatedAt: "2026-11-01T12:00:00.000Z",
    events: [{ step: "image", label: "Corner building saved" }],
    checkpoint: { blueprint: mockScenePlan(), assets: { building_0: "building_0.png" } }, leaseUntil: 1234, date: "2026-11-01",
  };
  const visible = publicWorldJob(state);
  assert.deepEqual(Object.keys(visible).sort(), ["completed", "events", "id", "status", "total", "updatedAt"]);
  assert.equal(visible.completed, 1);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("parallel batch caps generation at three and preserves forced out-of-order completions", async () => {
  const h = await harness();
  const checkpoint = (await advanceWorldBuild(h.input, { assets: {} }, h.deps)).checkpoint;
  const buildings = checkpoint.blueprint!.buildings;
  const gates = new Map(buildings.map(building => [building.name, deferred<void>()]));
  const savedGates = new Map(buildings.map(building => [building.id, deferred<void>()]));
  const allStarted = deferred<void>();
  const generate = h.deps.images.generate;
  const started: string[] = [];
  let active = 0, peak = 0;
  h.deps.images.generate = async request => {
    started.push(request.name); active++; peak = Math.max(peak, active);
    if (started.length === 3) allStarted.resolve();
    try { await gates.get(request.name)?.promise; return await generate(request); }
    finally { active--; }
  };
  const persisted: WorldCheckpoint[] = [];
  let latest = checkpoint;
  const run = advanceWorldAssetBatch(h.input, checkpoint, h.deps, async (next, event, total) => {
    assert.equal(total, 4); assert.equal(event.step, "image");
    const completed = Object.keys(next.assets).find(id => !latest.assets[id])!;
    latest = JSON.parse(JSON.stringify(next)); persisted.push(latest);
    savedGates.get(completed)?.resolve();
  }, 99);
  await allStarted.promise;
  assert.deepEqual(started, buildings.map(building => building.name));
  assert.equal(peak, 3);
  assert.equal(active, 3);
  assert.equal(h.calls.length, 0, "all generators remain behind explicit barriers");
  for (const index of [2, 0, 1]) {
    gates.get(buildings[index].name)!.resolve();
    await savedGates.get(buildings[index].id)!.promise;
  }
  await run;
  assert.equal(peak, 3);
  assert.equal(started.length, 3, "a batch never starts a fourth image call");
  assert.deepEqual(persisted.map(saved => Object.keys(saved.assets)), [
    ["building_2"], ["building_2", "building_0"], ["building_2", "building_0", "building_1"],
  ]);
  assert.deepEqual(checkpoint.assets, {}, "concurrent work must not mutate the supplied checkpoint");
  assert.equal(h.saved.has("day.json"), false);
  await advanceWorldAssetBatch(h.input, latest, h.deps, async next => { latest = next; });
  assert.equal(started.at(-1), "Your walking character");
  assert.equal(started.length, 4);
  assert.equal(h.plans(), 1);
  assert.equal(Object.keys(latest.assets).length, 4);
});

test("a parallel failure retains other successes and resume calls only failed or unstarted sprites", async () => {
  const h = await harness();
  const checkpoint = (await advanceWorldBuild(h.input, { assets: {} }, h.deps)).checkpoint;
  const buildings = checkpoint.blueprint!.buildings;
  const gates = new Map(buildings.map(building => [building.name, deferred<void>()]));
  const allStarted = deferred<void>();
  const generate = h.deps.images.generate;
  const attempted: string[] = [];
  h.deps.images.generate = async request => {
    attempted.push(request.name);
    if (attempted.length === 3) allStarted.resolve();
    await gates.get(request.name)?.promise;
    return generate(request);
  };
  let persisted = checkpoint;
  const run = advanceWorldAssetBatch(h.input, checkpoint, h.deps, async next => {
    persisted = JSON.parse(JSON.stringify(next));
  });
  const failure = assert.rejects(run, /credits or quota are exhausted/);
  await allStarted.promise;
  gates.get(buildings[1].name)!.reject({ code: "credit_balance_exhausted", status: 400 });
  gates.get(buildings[2].name)!.resolve();
  gates.get(buildings[0].name)!.resolve();
  await failure;
  assert.deepEqual(Object.keys(persisted.assets).sort(), ["building_0", "building_2"]);
  assert.ok(h.saved.has("building_0.png") && h.saved.has("building_2.png"));
  assert.equal(h.saved.has("building_1.png"), false);
  assert.equal(h.saved.has("player_walk.png"), false);
  assert.equal(h.saved.has("day.json"), false);
  h.deps.images.generate = async request => { attempted.push(request.name); return generate(request); };
  await advanceWorldAssetBatch(h.input, persisted, h.deps, async next => { persisted = next; });
  assert.deepEqual(attempted.slice(3), [buildings[1].name, "Your walking character"]);
  assert.equal(Object.keys(persisted.assets).length, 4);
  assert.equal(h.plans(), 1);
  const finished = await advanceWorldBuild(h.input, persisted, h.deps);
  assert.ok(finished.manifest);
  assert.equal(attempted.length, 5, "publication must not issue new image calls");
});
