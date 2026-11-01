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
