import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { ReadyDraft } from "../lib/draft";
import { worldJobId } from "../lib/server/world-jobs";
import { applyLocation, locateWorld, type Located } from "../pipeline/locator";
import { buildSceneAssetJobs } from "../pipeline/scene-assets";
import { mockScenePlan, planScene } from "../pipeline/scene-plan";
import { sceneUnits } from "../pipeline/scene-sources";
import { advanceWorldBuild, type WorldBuildDependencies } from "../pipeline/world-build";

test("scene planning receives every supporting photo and note while keeping canonical location and lunch", async () => {
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  const photos = [
    { kind: "fit" as const, bytes: photo, note: "Blue coat" },
    { kind: "landmark" as const, bytes: photo, note: "Main courtyard" },
    { kind: "landmark" as const, bytes: photo, note: "A different place later" },
    { kind: "lunch" as const, bytes: photo, note: "Featured soup" },
    { kind: "lunch" as const, bytes: photo, note: "Later sandwich" },
    { kind: "extra" as const, bytes: photo, note: "A small detail" },
  ];
  let calls = 0;
  const result = await planScene({ landmark: photo, lunch: photo, photos }, { responses: { async create(request) {
    calls++;
    const body = JSON.stringify(request.input);
    assert.equal((body.match(/data:image\/jpeg;base64,/g) ?? []).length, 5, "fit stays with character generation; all other photos are analysed exactly once");
    for (const item of photos) assert.ok(body.includes(item.note));
    assert.match(body, /SUPPORTING LANDMARK PHOTO 2/);
    assert.match(body, /SUPPORTING LUNCH PHOTO 2/);
    assert.match(body, /SUPPORTING EXTRA PHOTO 1/);
    assert.match(request.instructions as string, /ONE representative scene/);
    assert.match(request.instructions as string, /Never assume additional photos were taken at the same place/);
    return { status: "completed", output_text: JSON.stringify(mockScenePlan({ landmark: photo, lunch: photo })) };
  } } });
  assert.equal(calls, 1);
  assert.ok(result.food);
  assert.equal(result.source, "photo");
});

test("world build plans the first photo as its own scene and checkpoints deterministic design", async () => {
  const photo = Buffer.from("fixture");
  const photos = [{ kind: "landmark" as const, bytes: photo, note: "Favourite facade" }, { kind: "extra" as const, bytes: photo, note: "Something small" }];
  let plans = 0;
  const deps: WorldBuildDependencies = {
    async plan(input) {
      plans++;
      assert.equal(input.focus, "place");
      assert.equal(input.sceneId, "scene_1");
      assert.equal(input.kind, "tourist");
      assert.equal(input.landmark, photo);
      assert.equal(input.lunch, undefined);
      assert.equal(input.photos, undefined);
      assert.equal(input.context?.notes, "Favourite facade");
      return mockScenePlan(input);
    },
    images: { live: false, async generate() { throw new Error("planning must not draw images"); } },
    store: { manifestUrl: "/fixture/day.json", async put() { throw new Error("planning must checkpoint before publishing"); } },
  };
  const result = await advanceWorldBuild({ id: "handoff", date: "2026-11-01", name: "You", player: photo, uploads: { landmark: photo }, photos, environment: { notes: "All supplied notes" } }, { assets: {} }, deps);
  assert.equal(plans, 1);
  assert.equal(result.checkpoint.blueprint?.sceneId, "scene_1");
  assert.equal(result.checkpoint.blueprint?.design?.source, "fallback");
  assert.equal(result.checkpoint.blueprint?.design?.interactables.length, 3);
  assert.equal(result.manifest, undefined);
});

test("location research preserves all photographed buildings and their generation references", () => {
  const blueprint = mockScenePlan({ landmark: Buffer.from("location") });
  blueprint.buildings[0].observed = true;
  blueprint.buildings[1].observed = true;
  const observed = structuredClone(blueprint.buildings.slice(0, 2));
  const located: Located = { template: "street", reason: "A street", place: { known: true, summary: "A verified place", features: [], nearby: [], sources: [] },
    neighbours: [{ name: observed[1].name, description: "Already seen", relation: "Already in the photo" }, { name: "Other neighbour", description: "A low stone building", relation: "Along the street" }] };
  for (const research of [undefined, located]) {
    const resolved = applyLocation(blueprint, research);
    assert.deepEqual(resolved.buildings.slice(0, 2), observed);
    if (research) assert.equal(resolved.buildings[2].name, "Other neighbour");
    const photo = Buffer.from("canonical photo");
    const jobs = buildSceneAssetJobs(resolved, { player: Buffer.from("player"), uploads: { landmark: photo } });
    assert.equal(jobs[0].references[0], photo);
    assert.equal(jobs[1].references[0], photo);
  }
  assert.deepEqual(blueprint.buildings.slice(0, 2), observed, "research cannot mutate the photo inventory");
});

test("scene units are one explorable place per non-fit photo, meals included", () => {
  const photo = Buffer.from("p");
  assert.deepEqual(sceneUnits({ uploads: { fit: photo } }).map(unit => [unit.id, unit.kind, unit.photoKind]), [["scene_1", "tourist", "landmark"]]);
  assert.deepEqual(sceneUnits({
    uploads: { fit: photo, landmark: photo, lunch: photo },
    photos: [
      { kind: "fit", bytes: photo },
      { kind: "lunch", bytes: photo, note: "Ramen" },
      { kind: "landmark", bytes: photo, note: "Bridge" },
      { kind: "extra", bytes: photo },
    ],
  }).map(unit => [unit.id, unit.kind, unit.photoKind, unit.note]), [
    ["scene_1", "meal", "lunch", "Ramen"],
    ["scene_2", "tourist", "landmark", "Bridge"],
    ["scene_3", "tourist", "extra", undefined],
  ]);
});

test("focused meal planning sends only the lunch photograph", async () => {
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  let calls = 0;
  const result = await planScene({ lunch: photo, focus: "meal", sceneId: "scene_1", kind: "meal", context: { notes: "Dishoom Shoreditch" } }, { responses: { async create(request) {
    calls++;
    const body = JSON.stringify(request.input);
    assert.equal((body.match(/data:image\/jpeg;base64,/g) ?? []).length, 1);
    assert.match(body, /"LUNCH"/);
    assert.doesNotMatch(body, /SUPPORTING/);
    assert.match(request.instructions as string, /MEAL scene/);
    return { status: "completed", output_text: JSON.stringify(mockScenePlan({ lunch: photo, focus: "meal", kind: "meal" })) };
  } } });
  assert.equal(calls, 1);
  assert.ok(result.food);
  assert.equal(result.kind, "meal");
  assert.equal(result.notes, "Dishoom Shoreditch");
});

test("meal location research promotes the restaurant onto an unobserved shopfront", async () => {
  const blueprint = mockScenePlan({ lunch: Buffer.from("meal"), kind: "meal", focus: "meal", context: { notes: "Dishoom Shoreditch" } });
  assert.equal(blueprint.buildings[0].observed, false);
  let received = { name: "", instructions: "", input: "" };
  const located = await locateWorld(blueprint, async call => {
    received = { name: call.name, instructions: call.instructions, input: call.input };
    return {
      template: "street", reason: "A high-street cafe.",
      place: { known: true, summary: "A verified restaurant", features: ["green shopfront"], nearby: ["box park"], climateNote: null, sources: ["https://example.com"] },
      neighbours: [
        { name: "Dishoom Shoreditch", description: "A dark green shopfront with gold lettering", relation: "the place this meal was eaten" },
        { name: "Boxpark", description: "Stacked shipping-container shops", relation: "across the street" },
      ],
    };
  });
  assert.equal(received.name, "Restaurant researcher");
  assert.match(received.instructions, /IDENTIFY THE RESTAURANT/);
  assert.match(received.input, /Dishoom Shoreditch/);
  const resolved = applyLocation(blueprint, located);
  assert.equal(resolved.buildings[0].name, "Dishoom Shoreditch");
  assert.equal(resolved.locationName, "Dishoom Shoreditch");
  assert.equal(resolved.title, "Dishoom Shoreditch");
  assert.match(resolved.buildings[0].description, /green shopfront/i);
  assert.equal(resolved.buildings[1].name, "Boxpark");
  assert.deepEqual(blueprint.buildings[0], mockScenePlan({ lunch: Buffer.from("meal"), kind: "meal" }).buildings[0], "research cannot mutate the meal inventory");
});

test("additional-photo ordering, content and notes are included in resumable world identity", () => {
  const draft: ReadyDraft = { sessionId: "b8dcc7ca-3926-405f-a375-b6a05b0e6d46", spriteUrl: "https://example.com/player.png", uploads: [
    { kind: "fit", url: "https://example.com/fit.png" },
    { kind: "landmark", url: "https://example.com/first.png", note: "Primary" },
    { kind: "landmark", url: "https://example.com/second.png", note: "Supporting" },
    { kind: "extra", url: "https://example.com/detail.png", note: "Detail" },
  ] };
  const original = worldJobId(draft);
  assert.notEqual(worldJobId({ ...draft, uploads: draft.uploads.map((photo, i) => i === 2 ? { ...photo, note: "Changed note" } : photo) }), original);
  assert.notEqual(worldJobId({ ...draft, uploads: [draft.uploads[0], draft.uploads[2], draft.uploads[1], draft.uploads[3]] }), original);
  assert.notEqual(worldJobId({ ...draft, uploads: [...draft.uploads, { kind: "extra", url: "https://example.com/another.png" }] }), original);
});
