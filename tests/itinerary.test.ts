import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { attachJourneys, type JourneyConnection } from "../lib/itinerary";
import { parseDayManifest, sceneCanStep, sceneReachableTiles, type DayManifest, type DayScene, type JourneyLeg } from "../lib/day";

function scene(id: string): DayScene {
  return { id, kind: "tourist", title: `Place ${id}`, time: "12:00", base: "street", landmarks: [],
    spawn: { x: 20, y: 25 }, exit: { x: 39, y: 20 },
    world: { width: 40, height: 28, ground: Array.from({ length: 28 }, () => "p".repeat(40)),
      objects: [{ id: "building", name: "Building", sprite: "building.png", x: 80, y: 64, width: 64, height: 48,
        collision: { x: 50, y: 48, width: 60, height: 16 } }] } };
}
function connections(scenes: DayScene[]): JourneyConnection[] {
  return scenes.slice(0, -1).map((from, i) => ({ fromSceneId: from.id!, toSceneId: scenes[i + 1].id!,
    legs: [{ mode: "bus", route: "24", destination: `Stop ${i + 1}`, from: `Stop ${i}`, to: `Stop ${i + 1}` }] }));
}
function manifest(scenes = [scene("a"), scene("b"), scene("c")]): DayManifest {
  return { id: "itinerary", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, ...attachJourneys(scenes, connections(scenes)) };
}

test("ordered worlds accept repeated scene kinds and exact keyed adjacent journeys", () => {
  const scenes = [scene("a"), scene("b"), scene("c")], before = structuredClone(scenes);
  const route = connections(scenes).reverse();
  const built = attachJourneys(scenes, route);
  assert.deepEqual(scenes, before, "adapter must never alter supplied geometry or spawn points");
  assert.deepEqual(built.scenes.map(value => value.id), ["a", "b", "c"]);
  assert.deepEqual(built.journeys.map(value => [value.fromSceneId, value.toSceneId]), [["a", "b"], ["b", "c"]]);
  assert.deepEqual(built.transit, []);
  assert.deepEqual(built.journeys[0].departure.tile, { x: 34, y: 12 });
  assert.deepEqual(built.journeys[0].departure.approach, { x: 33, y: 12 });
  assert.deepEqual(built.journeys[0].arrival.tile, { x: 5, y: 12 });
  assert.deepEqual(built.journeys[0].arrival.approach, { x: 6, y: 12 });
  assert.equal(parseDayManifest(manifest(), "itinerary").scenes.length, 3);
});

test("single worlds and legacy three-scene demo remain compatible", async () => {
  const only = scene("only"); delete only.id;
  const minimal: DayManifest = { id: "single", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, scenes: [only], transit: [] };
  assert.equal(parseDayManifest(minimal, "single").scenes.length, 1);
  assert.deepEqual(attachJourneys([only], []).journeys, []);
  assert.equal(parseDayManifest({ ...minimal, journeys: [] }, "single").journeys?.length, 0);
  const legacy = JSON.parse(await readFile("public/days/demo/day.json", "utf8"));
  assert.equal(parseDayManifest(legacy, "demo").transit.length, 2);
});

test("multi-world parser rejects missing, duplicate, mismatched and non-adjacent journeys", () => {
  const mutations: ((value: DayManifest) => void)[] = [
    value => { delete value.journeys; },
    value => { value.journeys!.pop(); },
    value => { value.journeys![0].toSceneId = "c"; },
    value => { value.journeys!.reverse(); },
    value => { value.journeys![1].id = value.journeys![0].id; },
    value => { value.scenes[1].id = value.scenes[0].id; },
    value => { delete value.scenes[1].id; },
    value => { value.transit = [{ legs: [{ mode: "bus", route: "1", destination: "B", from: "A", to: "B" }] }]; },
    value => { value.journeys![0].departure.kind = "station"; },
    value => { value.journeys![0].arrival.label = "Wrong stop"; },
    value => { value.journeys![0].departure.tile.x = 40; },
    value => { value.scenes[0].food = { sprite: "food.png", tile: { ...value.journeys![0].departure.tile }, text: "Lunch" }; },
    value => { value.scenes[0].world!.ground[12] = "p".repeat(34) + "w" + "p".repeat(5); },
    value => { value.journeys![0].departure.approach = { x: 32, y: 12 }; },
  ];
  for (const mutate of mutations) { const value = manifest(); mutate(value); assert.throws(() => parseDayManifest(value, "itinerary")); }
});

test("journey legs preserve route continuity, endpoint kinds and bounded durations", () => {
  const scenes = [scene("a"), scene("b")];
  const legs: JourneyLeg[] = [
    { mode: "tube", line: "Central", color: "#E32017", stations: ["Start", "Oxford Circus"], durationMs: 1000 },
    { mode: "tube", line: "Bakerloo", color: "#B36305", stations: [" oxford   circus ", "End"], durationMs: 15000 },
  ];
  const build = (values: JourneyLeg[]) => attachJourneys(scenes, [{ fromSceneId: "a", toSceneId: "b", legs: values }]);
  const valid = build(legs);
  assert.equal(valid.journeys[0].departure.kind, "station");
  assert.equal(valid.journeys[0].arrival.kind, "station");
  for (const durationMs of [999, 15001, NaN, Infinity]) assert.throws(() => build([{ ...legs[0], durationMs }]));
  assert.throws(() => build([legs[0], { ...legs[1], stations: ["Wrong interchange", "End"] } as JourneyLeg]), /transfer stops/);
  const walking = build([{ mode: "walk", from: "Front gate", to: "Back gate" }]);
  assert.equal(walking.journeys[0].departure.kind, "path");
});

test("automatic anchors move around obstacles and food without rewriting a location", () => {
  const scenes = [scene("a"), scene("b")];
  scenes[0].food = { sprite: "food.png", tile: { x: 34, y: 12 }, text: "Your lunch." };
  const before = structuredClone(scenes);
  const built = attachJourneys(scenes, connections(scenes));
  assert.notDeepEqual(built.journeys[0].departure.tile, scenes[0].food.tile);
  assert.deepEqual(scenes, before);
  const barrier = scene("barrier");
  barrier.world!.objects.push({ id: "wall", name: "Wall", sprite: "wall.png", x: 320, y: 304, width: 640, height: 16,
    collision: { x: 0, y: 296, width: 640, height: 8 } });
  const shifted = attachJourneys([barrier, scene("end")], [{ fromSceneId: "barrier", toSceneId: "end", legs: [{ mode: "walk", from: "Start", to: "End" }] }]);
  assert.ok(shifted.journeys[0].departure.tile.y >= 19, "anchor must stay in spawn's connected component");
  const explicit = structuredClone(shifted.journeys[0].departure);
  explicit.tile = { x: 34, y: 12 }; explicit.approach = { x: 33, y: 12 };
  assert.throws(() => attachJourneys([barrier, scene("end")], [{ fromSceneId: "barrier", toSceneId: "end", legs: [{ mode: "walk", from: "Start", to: "End" }], departure: explicit }]), /unreachable/);
});

test("swept route checks catch a thin fence between otherwise walkable tile centres", () => {
  const world = scene("a");
  world.world!.objects.push({ id: "fence", name: "Fence", sprite: "fence.png", x: 336, y: 214, width: 2, height: 20,
    collision: { x: 335, y: 192, width: 2, height: 20 } });
  assert.equal(sceneCanStep(world, { x: 20, y: 12 }, { x: 21, y: 12 }), false);
  assert.ok(sceneReachableTiles(world).has("20,12"));
  const isolated = scene("isolated");
  isolated.world!.ground = Array.from({ length: 28 }, () => "w".repeat(40));
  isolated.world!.ground[25] = "w".repeat(20) + "p" + "w".repeat(19);
  isolated.exit = { ...isolated.spawn };
  assert.throws(() => attachJourneys([isolated, scene("b")], [{ fromSceneId: "isolated", toSceneId: "b", legs: [{ mode: "walk", from: "A", to: "B" }] }]), /No reachable travel point/);
});

test("adapter rejects extra connections and requires explicit anchors on custom-sized worlds", () => {
  const scenes = [scene("a"), scene("b")];
  assert.throws(() => attachJourneys(scenes, []));
  assert.throws(() => attachJourneys(scenes, [...connections(scenes), { fromSceneId: "b", toSceneId: "a", legs: [] }]));
  assert.throws(() => attachJourneys(Array.from({ length: 13 }, (_, i) => scene(`s${i}`)), Array.from({ length: 12 }, (_, i) => ({ fromSceneId: `s${i}`, toSceneId: `s${i + 1}`, legs: [{ mode: "walk", from: "A", to: "B" }] }))));
  scenes[0].world!.width = 41;
  scenes[0].world!.ground = scenes[0].world!.ground.map(row => row + "p");
  assert.throws(() => attachJourneys(scenes, connections(scenes)), /explicit travel points/);
  const point = { kind: "bus_stop" as const, label: "Stop 0", tile: { x: 34, y: 12 }, approach: { x: 33, y: 12 } };
  assert.equal(attachJourneys(scenes, [{ ...connections(scenes)[0], departure: point }]).journeys.length, 1);
});

test("the maximum twelve-scene itinerary validates all eleven ordered connections", () => {
  const scenes = Array.from({ length: 12 }, (_, i) => scene(`location_${i + 1}`));
  const built = attachJourneys(scenes, connections(scenes));
  const value = { id: "maximum", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, ...built };
  assert.equal(parseDayManifest(value, "maximum").journeys?.length, 11);
  assert.equal(built.journeys.at(-1)?.toSceneId, "location_12");
});
