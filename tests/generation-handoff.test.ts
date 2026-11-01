import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { ReadyDraft } from "../lib/draft";
import { worldJobId } from "../lib/server/world-jobs";
import { applyLocation, type Located } from "../pipeline/locator";
import { buildSceneAssetJobs } from "../pipeline/scene-assets";
import { mockScenePlan, planScene } from "../pipeline/scene-plan";
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

test("world build passes complete photo context and checkpoints deterministic design with interaction support intact", async () => {
  const photo = Buffer.from("fixture");
  const photos = [{ kind: "landmark" as const, bytes: photo, note: "Favourite facade" }, { kind: "extra" as const, bytes: photo, note: "Something small" }];
  let plans = 0;
  const deps: WorldBuildDependencies = {
    async plan(input) {
      plans++;
      assert.equal(input.photos, photos);
      assert.equal(input.context?.notes, "All supplied notes");
      return mockScenePlan(input);
    },
    images: { live: false, async generate() { throw new Error("planning must not draw images"); } },
    store: { manifestUrl: "/fixture/day.json", async put() { throw new Error("planning must checkpoint before publishing"); } },
  };
  const result = await advanceWorldBuild({ id: "handoff", date: "2026-11-01", name: "You", player: photo, uploads: { landmark: photo }, photos, environment: { notes: "All supplied notes" } }, { assets: {} }, deps);
  assert.equal(plans, 1);
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
