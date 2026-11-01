import test from "node:test";
import assert from "node:assert/strict";
import { generatedManifestUrl, isDayId, parseDayManifest, resolveDayAsset } from "../lib/day";

function manifest() {
  return {
    id: "demo", date: "2026-11-07", player: { name: "LUCAS", sprite: "player.png" },
    scenes: ["tourist", "meal", "park"].map((kind, index) => ({
      kind, title: kind, time: "10:00", base: ["city", "street", "park"][index],
      spawn: { x: 10, y: 13 }, exit: { x: 19, y: 7 },
      landmarks: [0, 1, 2].map((slot) => ({ name: `Landmark ${slot}`, sprite: `s${index}_l${slot}.png`, footprint: "S", slot, text: "Visited this place." })),
    })),
    transit: [0, 1].map(() => ({ legs: [{ mode: "bus", route: "24", destination: "Hampstead Heath", from: "Parliament Square", to: "Tottenham Court Road" }] })),
  };
}

test("validates complete shared manifests and rejects incomplete or mismatched days", () => {
  assert.equal(parseDayManifest(manifest(), "demo").scenes.length, 3);
  assert.throws(() => parseDayManifest(manifest(), "another"));
  const incomplete = manifest(); incomplete.scenes.pop();
  assert.throws(() => parseDayManifest(incomplete, "demo"));
  const duplicate = manifest(); duplicate.scenes[0].landmarks[1].slot = 0;
  assert.throws(() => parseDayManifest(duplicate, "demo"));
});

test("validates IDs and publishes to the exact expected Blob path", () => {
  assert.equal(isDayId("../../secret"), false);
  assert.equal(isDayId("day_q2-5"), true);
  assert.equal(generatedManifestUrl("day_q2-5", "https://assets.example.com/"), "https://assets.example.com/days/day_q2-5/day.json");
  assert.throws(() => generatedManifestUrl("../demo", "https://assets.example.com"));
  assert.throws(() => generatedManifestUrl("demo", "https://assets.example.com?token=secret"));
});

test("resolves player and scene assets against local and generated manifests", () => {
  assert.equal(resolveDayAsset("player.png", "/days/demo/day.json"), "/days/demo/player.png");
  assert.equal(resolveDayAsset("s0_l0.png", "https://assets.example.com/days/abc/day.json"), "https://assets.example.com/days/abc/s0_l0.png");
  assert.equal(resolveDayAsset("/tiles/dq/library/tree.png", "https://assets.example.com/days/abc/day.json"), "/tiles/dq/library/tree.png");
  const unsafe = manifest(); unsafe.player.sprite = "javascript:alert(1)";
  assert.throws(() => parseDayManifest(unsafe, "demo"));
  assert.throws(() => resolveDayAsset("data:image/png;base64,abc", "/days/demo/day.json"));
});

test("food evidence is optional for legacy manifests and validated separately from personal text", () => {
  const legacy = manifest();
  const food = { sprite: "lunch.png", tile: { x: 10, y: 10 }, text: "A quiet break in the day." };
  Object.assign(legacy.scenes[1], { food });
  assert.equal(parseDayManifest(legacy, "demo").scenes[1].food?.name, undefined);
  const enriched = structuredClone(legacy);
  Object.assign(enriched.scenes[1], { food: { ...food, name: "Tomato sandwich", description: "Seeded bread, tomato and lettuce." } });
  assert.deepEqual(parseDayManifest(enriched, "demo").scenes[1].food, { ...food, name: "Tomato sandwich", description: "Seeded bread, tomato and lettuce." });
  for (const evidence of [{ name: 123 }, { name: "" }, { name: "n".repeat(101) }, { description: false }, { description: "" }, { description: "d".repeat(1801) }]) {
    const invalid = structuredClone(legacy);
    Object.assign(invalid.scenes[1], { food: { ...food, ...evidence } });
    assert.throws(() => parseDayManifest(invalid, "demo"), /Invalid food/);
  }
});
