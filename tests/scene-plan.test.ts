import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { mockScenePlan, normalizeScenePlan, planScene, type ScenePlannerClient } from "../pipeline/scene-plan";
import type { ScenePlanInput } from "../pipeline/scene-types";

function inventory() {
  return {
    title: "The red-brick corner", locationName: "A red-brick corner", description: "A quiet corner with red brick and blue window frames.", time: "12:00", ground: "street",
    buildings: [0, 1, 2].map(i => ({ name: `Building ${i}`, description: "Red brick with blue window frames.", observed: i === 0 })),
    props: [{ name: "Lamp", description: "A green street lamp.", library: "lamp" }], food: null as unknown,
  };
}
function worldManifest(): DayManifest {
  return {
    id: "photo-day", date: "2026-11-01", player: { name: "You", sprite: "player.png", walkSheet: "player_walk.png" },
    scenes: [{ kind: "tourist", title: "Your corner", time: "12:00", base: "street", landmarks: [], spawn: { x: 20, y: 25 }, exit: { x: 39, y: 22 },
      world: { width: 40, height: 28, ground: Array.from({ length: 28 }, () => "p".repeat(40)),
        objects: [{ id: "building_0", name: "Corner building", sprite: "building_0.png", x: 120, y: 160, width: 160, height: 128,
          collision: { x: 48, y: 144, width: 144, height: 16 }, text: "A red-brick corner." }] } }], transit: [],
  };
}

test("photo plans keep their observed architecture and deterministic asset IDs", () => {
  const result = normalizeScenePlan(inventory(), { landmark: Buffer.from("photo") });
  assert.equal(result.source, "photo");
  assert.equal(result.locationName, "A red-brick corner");
  assert.deepEqual(result.buildings.map(b => b.id), ["building_0", "building_1", "building_2"]);
  assert.deepEqual(result.buildings.map(b => b.observed), [true, false, false]);
  assert.equal(result.props[0].library, "lamp");
});

test("fit-only and lunch-only plans cannot claim an observed location or invented food", () => {
  const fit = normalizeScenePlan(inventory(), {});
  assert.equal(fit.source, "fit-only");
  assert.equal(fit.locationName, "Your place");
  assert.ok(fit.buildings.every(b => !b.observed));
  const raw = inventory(); raw.food = { name: "Soup", description: "White bowl of red soup.", text: "A bowl of red soup." };
  assert.throws(() => normalizeScenePlan(raw, {}), /no source photograph/);
  const meal = normalizeScenePlan(raw, { lunch: Buffer.from("photo") });
  assert.equal(meal.source, "photo");
  assert.equal(meal.food?.name, "Soup");
  assert.equal(meal.locationName, "Your place");
  assert.ok(meal.buildings.every(b => !b.observed));
});

test("malformed model inventories fail rather than publishing coerced or missing assets", () => {
  for (const mutate of [
    (raw: ReturnType<typeof inventory>) => { raw.buildings.pop(); },
    (raw: ReturnType<typeof inventory>) => { raw.buildings[0].name = ""; },
    (raw: ReturnType<typeof inventory>) => { raw.time = "99:99"; },
    (raw: ReturnType<typeof inventory>) => { raw.props[0].library = "../../secret"; },
  ]) {
    const raw = inventory(); mutate(raw);
    assert.throws(() => normalizeScenePlan(raw, {}));
  }
  assert.throws(() => normalizeScenePlan(inventory(), { lunch: Buffer.from("photo") }), /missing photographed lunch/);
  assert.throws(() => normalizeScenePlan(null, {}));
});

test("Responses request labels location and lunch images, uses strict schema and no demo history", async () => {
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  const raw = inventory(); raw.food = { name: "Soup", description: "Red soup in a white bowl.", text: "A bowl of soup." };
  let requests = 0;
  const client: ScenePlannerClient = { responses: { async create(request) {
    requests++;
    assert.equal(request.text?.format?.type, "json_schema");
    assert.equal(request.text?.format && "strict" in request.text.format ? request.text.format.strict : false, true);
    const body = JSON.stringify(request.input);
    assert.ok(body.includes("LOCATION") && body.includes("LUNCH"));
    assert.equal((body.match(/data:image\/jpeg;base64,/g) ?? []).length, 2);
    assert.ok(!body.includes("Westminster") && !body.includes("Regent"));
    return { status: "completed", output_text: JSON.stringify(raw) };
  } } };
  const result = await planScene({ landmark: photo, lunch: photo, context: { name: "You", date: "2026-11-01" } }, client);
  assert.equal(requests, 1);
  assert.equal(result.food?.name, "Soup");
});

test("live planner propagates billing errors and rejects incomplete/invalid responses", async () => {
  const billing = new Error("credit_balance_exhausted");
  await assert.rejects(planScene({}, { responses: { create: async () => { throw billing; } } }), error => error === billing);
  for (const response of [{ status: "incomplete", output_text: "{}" }, { status: "completed", output_text: "" }, { output_text: "not json" }]) {
    await assert.rejects(planScene({}, { responses: { create: async () => response } }));
  }
});

test("explicit mock inventory makes no claim to have analysed the user's photo", () => {
  const input: ScenePlanInput = { landmark: Buffer.from("photo"), lunch: Buffer.from("photo") };
  const mock = mockScenePlan(input);
  assert.ok(mock.buildings.every(b => !b.observed));
  assert.match(mock.description, /offline/i);
  assert.ok(mock.food);
});

test("one-scene manifests support the larger world, walk sheet and zero transit", () => {
  const parsed = parseDayManifest(worldManifest(), "photo-day");
  assert.equal(parsed.scenes[0].world?.width, 40);
  assert.equal(parsed.scenes[0].exit.x, 39);
  assert.equal(parsed.player.walkSheet, "player_walk.png");
  assert.equal(parsed.transit.length, 0);
});

test("world validation rejects malformed geometry, missing objects and unsafe assets", () => {
  const mutations: ((manifest: DayManifest) => void)[] = [
    value => { value.scenes[0].world!.ground.pop(); },
    value => { value.scenes[0].world!.ground[0] = "p".repeat(39); },
    value => { value.scenes[0].world!.ground[0] = "?".repeat(40); },
    value => { value.scenes[0].world!.objects = []; },
    value => { value.scenes[0].world!.objects.push({ ...value.scenes[0].world!.objects[0] }); },
    value => { value.scenes[0].world!.objects[0].x = 20; },
    value => { value.scenes[0].world!.objects[0].height = NaN; },
    value => { value.scenes[0].world!.objects[0].collision!.width = 1000; },
    value => { value.scenes[0].world!.objects[0].sprite = "javascript:alert(1)"; },
    value => { value.player.walkSheet = "../secret.png"; },
    value => { value.player.walkSheet = "%2e%2e/secret.png"; },
    value => { value.player.walkSheet = "https://"; },
    value => { value.player.walkSheet = "https://user:password@example.com/private.png"; },
    value => { value.scenes[0].spawn.x = 40; },
    value => { value.scenes[0].spawn = { x: 4, y: 9 }; },
    value => { value.scenes[0].world!.objects[0].collision = { x: 326, y: 412, width: 4, height: 3 }; },
    value => { value.scenes[0].world = undefined; },
    value => { value.transit.push({ legs: [] }); },
  ];
  for (const mutate of mutations) {
    const value = worldManifest(); mutate(value);
    assert.throws(() => parseDayManifest(value, "photo-day"));
  }
});
