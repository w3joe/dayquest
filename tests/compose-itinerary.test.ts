import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldLayout } from "../game/world-layout";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { composeWorldItinerary, importWorldPlayer, importWorldScene } from "../pipeline/compose-itinerary";
import { mockScenePlan } from "../pipeline/scene-plan";

function location(id: string): DayManifest {
  const blueprint = mockScenePlan({ lunch: Buffer.from("fixture") });
  const layout = buildWorldLayout(blueprint, Object.fromEntries(blueprint.buildings.map(building => [building.id, `${building.id}.png`])));
  return { id, date: "2026-11-01", player: { name: "You", sprite: "player.png", walkSheet: "player_walk.png" },
    scenes: [{ title: id, time: "12:00", kind: "tourist", base: "street", world: layout.world,
      spawn: layout.spawn, exit: layout.exit, landmarks: [],
      food: { tile: layout.foodTile, sprite: "food.png", icon: "food_icon.png", text: "Fixture lunch" } }], transit: [] };
}

test("independent location assets keep their source origin while shared artwork stays on the app", () => {
  const source = location("source-a");
  const before = structuredClone(source);
  const scene = importWorldScene(source, "https://a.example/days/source-a/day.json", "location-a");
  assert.equal(scene.id, "location-a");
  assert.equal(scene.world!.objects[0].sprite, "https://a.example/days/source-a/building_0.png");
  assert.ok(scene.world!.objects.some(object => object.sprite === "/tiles/dq/library/lamp.png"));
  assert.equal(scene.food!.sprite, "https://a.example/days/source-a/food.png");
  assert.equal(scene.food!.icon, "https://a.example/days/source-a/food_icon.png");
  assert.deepEqual(source, before);
  assert.notEqual(scene.world, source.scenes[0].world);
  scene.world!.objects[0].collision!.x++;
  assert.deepEqual(source, before, "imported collision edits cannot mutate the source world");
});

test("two separately published worlds connect by bus with one shared accepted character", () => {
  const a = location("source-a"), b = location("source-b");
  const aUrl = "https://a.example/days/source-a/day.json", bUrl = "https://b.example/days/source-b/day.json";
  const scenes = [importWorldScene(a, aUrl, "a"), importWorldScene(b, bUrl, "b")];
  const before = structuredClone(scenes);
  const manifest = composeWorldItinerary({ id: "connected-day", date: "2026-11-01", player: importWorldPlayer(a, aUrl), scenes,
    connections: [{ fromSceneId: "a", toSceneId: "b", legs: [{ mode: "bus", route: "24", destination: "B", from: "A stop", to: "B stop" }] }] });
  assert.equal(parseDayManifest(manifest, manifest.id), manifest);
  assert.equal(manifest.player.walkSheet, "https://a.example/days/source-a/player_walk.png");
  assert.equal(manifest.scenes[1].world!.objects[0].sprite, "https://b.example/days/source-b/building_0.png");
  assert.equal(manifest.journeys!.length, 1);
  assert.equal(manifest.journeys![0].departure.kind, "bus_stop");
  assert.equal(manifest.journeys![0].arrival.label, "B stop");
  assert.deepEqual(manifest.transit, []);
  assert.deepEqual(scenes, before, "connecting worlds preserves supplied location layouts");
});

test("local source URLs remain local and malformed imports fail before composing", () => {
  const source = location("source-a");
  assert.equal(importWorldScene(source, "/days/source-a/day.json", "a").food!.sprite, "/days/source-a/food.png");
  assert.equal(importWorldPlayer(source, "/days/source-a/day.json").sprite, "/days/source-a/player.png");
  assert.throws(() => importWorldScene(source, "/days/source-a/day.json", "../a"), /stable scene ID/);
  assert.throws(() => importWorldScene(source, "/days/source-a/day.json", "a", 20), /completed world/);
  assert.throws(() => importWorldScene({ ...source, player: { name: "You", sprite: "data:image/png,invalid" } }, "/days/source-a/day.json", "a"), /Invalid day/);
});
