import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { pixelateSceneSprite, pixelateWalkSheet, WALK_SHEET } from "../pipeline/pixelate";
import { safeOpenAIError } from "../lib/server/openai-errors";
import { buildSceneAssetJobs, generateSceneAsset } from "../pipeline/scene-assets";
import type { SceneBlueprint } from "../pipeline/scene-types";

async function fixtureSheet(missingCell = -1): Promise<Buffer> {
  const width = 300, height = 400;
  const data = Buffer.alloc(width * height * 4);
  for (let cell = 0; cell < 12; cell++) {
    if (cell === missingCell) continue;
    // Deliberately offset frames: processing must centre them and align feet.
    const left = (cell % 3) * 100 + 10 + cell;
    const top = Math.floor(cell / 3) * 100 + 12 + cell;
    for (let y = top; y < top + 60; y++) for (let x = left; x < left + 24; x++) {
      const i = (y * width + x) * 4;
      data[i] = 30 + cell * 15;
      data[i + 1] = 230 - cell * 14;
      data[i + 2] = 80;
      data[i + 3] = 180;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("walking sheet keeps twelve distinct cells on a shared scale and foot baseline", async () => {
  const result = await pixelateWalkSheet(await fixtureSheet());
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, WALK_SHEET.width);
  assert.equal(metadata.height, WALK_SHEET.height);
  assert.deepEqual(WALK_SHEET.directions, ["down", "left", "right", "up"]);
  const { data } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colours = new Set<string>();
  const frameColours = new Set<string>();
  for (let cell = 0; cell < 12; cell++) {
    let minX = 32, maxX = -1, minY = 48, maxY = -1;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      const i = ((Math.floor(cell / 3) * 48 + y) * 96 + (cell % 3) * 32 + x) * 4;
      assert.ok(data[i + 3] === 0 || data[i + 3] === 255);
      colours.add(data.subarray(i, i + 4).toString("hex"));
      if (!data[i + 3]) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      frameColours.add(data.subarray(i, i + 3).toString("hex"));
    }
    assert.equal(maxY, 45, `frame ${cell} feet`);
    assert.equal(maxY - minY + 1, 44, `frame ${cell} height`);
    assert.equal(maxX - minX + 1, 18, `frame ${cell} width`);
    assert.equal(minX, 7, `frame ${cell} centred`);
  }
  assert.ok(colours.size <= 32);
  assert.equal(frameColours.size, 12);
});

test("opaque, empty, absent and clipped frames cannot be accepted as walk sheets", async () => {
  for (const background of ["red", "#00000000"]) {
    const bytes = await sharp({ create: { width: 300, height: 400, channels: 4, background } }).png().toBuffer();
    await assert.rejects(pixelateWalkSheet(bytes), /transparent background/);
  }
  await assert.rejects(pixelateWalkSheet(await fixtureSheet(7)), /empty or clipped frame/);
  const sheet = await fixtureSheet();
  const clipped = await sharp(sheet).composite([{ input: await sharp({ create: { width: 100, height: 3, channels: 4, background: "red" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  await assert.rejects(pixelateWalkSheet(clipped), /empty or clipped frame/);
});

test("scene sprites reject opaque images and fit the richer building dimensions", async () => {
  const opaque = await sharp({ create: { width: 80, height: 80, channels: 4, background: "red" } }).png().toBuffer();
  await assert.rejects(pixelateSceneSprite(opaque, 160, 128), /transparent background/);
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: "#00000000" } })
    .composite([{ input: await sharp({ create: { width: 60, height: 60, channels: 4, background: "red" } }).png().toBuffer(), left: 20, top: 10 }]).png().toBuffer();
  const result = await pixelateSceneSprite(source, 160, 128);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 128);
});

test("provider failures become actionable messages without exposing upstream data", () => {
  for (const code of ["credit_balance_exhausted", "insufficient_quota", "billing_hard_limit_reached"]) {
    const error = safeOpenAIError({ code, status: 400, message: "secret-photo-and-api-key" });
    assert.equal(error.status, 503);
    assert.match(error.message, /credits or quota are exhausted/);
    assert.doesNotMatch(error.message, /secret-photo-and-api-key/);
  }
  assert.equal(safeOpenAIError({ status: 429 }).status, 429);
  assert.match(safeOpenAIError({ status: 401 }).message, /OPENAI_API_KEY/);
  assert.match(safeOpenAIError({ status: 404 }).message, /OPENAI_IMAGE_MODEL/);
  assert.equal(safeOpenAIError({ name: "APIConnectionTimeoutError" }).status, 504);
  assert.doesNotMatch(safeOpenAIError(new Error("private provider payload")).message, /private provider payload/);
});

test("scene jobs keep primary photo references, skip reusable props, and propagate failed assets", async () => {
  const location = Buffer.from("location"), lunch = Buffer.from("lunch"), player = Buffer.from("player"), style = Buffer.from("style");
  const blueprint: SceneBlueprint = {
    title: "Your afternoon", locationName: "A brick cafe", description: "A local street", time: "14:00", ground: "street", source: "photo",
    buildings: [0, 1, 2].map((i) => ({ id: `building_${i}`, name: `Building ${i}`, description: "Brickwork", observed: i === 0 })),
    props: [{ id: "prop_0", name: "Lamp", description: "A lamp", library: "lamp" }, { id: "prop_1", name: "Sculpture", description: "A blue sculpture" }],
    food: { name: "Lunch", description: "A colourful sandwich", text: "Your lunch" },
  };
  const jobs = buildSceneAssetJobs(blueprint, { uploads: { landmark: location, lunch }, player, styleReferences: [style] });
  assert.deepEqual(jobs.map((job) => job.id), ["building_0", "building_1", "building_2", "prop_1", "food", "player_walk"]);
  assert.equal(jobs[0].references[0], location);
  assert.equal(jobs[0].references[1], style);
  assert.equal(jobs.find((job) => job.id === "food")!.references[0], lunch);
  const walk = jobs.find((job) => job.id === "player_walk")!;
  assert.equal(walk.references[0], player);
  assert.match(walk.prompt, /THREE equal-width columns and FOUR equal-height rows/);
  let calls = 0;
  await assert.rejects(generateSceneAsset(walk, { live: false, async generate() { calls++; throw { code: "credit_balance_exhausted", message: "private" }; } }), /credits or quota are exhausted/);
  assert.equal(calls, 1, "failed generation must never silently produce a placeholder");
  const output = await generateSceneAsset(walk, { live: false, async generate() { return fixtureSheet(); } });
  assert.equal((await sharp(output).metadata()).width, 96);
});
