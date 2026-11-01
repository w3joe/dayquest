import assert from "node:assert/strict";
import test from "node:test";
import { dayProgressScope } from "../lib/game-progress";
import { parseDayManifest, type DayManifest, type DayScene } from "../lib/day";

function scene(id: string): DayScene {
  return { id, kind: "tourist", title: `Place ${id}`, time: "12:00", base: "street", landmarks: [], spawn: { x: 2, y: 6 }, exit: { x: 19, y: 12 },
    world: { width: 20, height: 15, ground: Array(15).fill("p".repeat(20)), objects: [
      { id: "display", name: "Flower display", removable: true, sprite: "display.png", x: 104, y: 111, width: 16, height: 16, collision: { x: 96, y: 103, width: 16, height: 8 } },
    ] },
    interactionPack: { version: 1, catalog: { version: 1, assets: [
      { id: "rose", src: "rose.png", width: 16, height: 16, kind: "prop" },
      { id: "sparkle", src: "sparkle.png", width: 16, height: 16, kind: "effect", frames: 3, frameMs: 100 },
    ] }, actions: [{ id: "take", targetId: "display", label: "Take a flower", repeatable: false, approach: { x: 5, y: 6 },
      steps: [{ type: "say", text: "A flower for the journey." }, { type: "attach", assetId: "rose" }, { type: "setObject", state: "hidden" }] }] } };
}
function manifest(): DayManifest {
  return { id: "same-published-day", date: "2026-11-01", player: { name: "You", sprite: "player.png", walkSheet: "player_walk.png" },
    scenes: [scene("a"), scene("b")], transit: [], journeys: [{ id: "a-to-b", fromSceneId: "a", toSceneId: "b",
      departure: { kind: "bus_stop", label: "A stop", tile: { x: 15, y: 6 }, approach: { x: 14, y: 6 } },
      arrival: { kind: "path", label: "B gate", tile: { x: 3, y: 6 }, approach: { x: 4, y: 6 } },
      legs: [{ mode: "bus", route: "24", destination: "B stop", from: "A stop", to: "B stop" }, { mode: "walk", from: "B stop", to: "B gate" }] }] };
}
function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
  return value;
}

test("progress scopes are deterministic across JSON reloads and equivalent nested object key orders", () => {
  const day = manifest(), scope = dayProgressScope(day);
  assert.match(scope, /^v1:same-published-day:[0-9a-f]{16}$/);
  assert.equal(dayProgressScope(day), scope);
  assert.equal(dayProgressScope(JSON.parse(JSON.stringify(day))), scope);
  assert.equal(dayProgressScope(reverseObjectKeys(day) as DayManifest), scope);
  const withOmittedOptional = structuredClone(day);
  withOmittedOptional.scenes[0].food = undefined;
  assert.equal(dayProgressScope(withOmittedOptional), scope, "JSON-equivalent omitted optionals must not reset progress");
});

test("revisions with reused day/scene/action IDs cannot reuse stale world or transport progress", () => {
  const base = manifest(), scope = dayProgressScope(base);
  const changes: ((day: DayManifest) => void)[] = [
    day => { day.player.sprite = "player-new.png"; },
    day => { day.scenes[0].world!.objects[0].sprite = "display-new.png"; },
    day => { day.scenes[0].world!.objects[0].removable = false; },
    day => { day.scenes[0].world!.objects[0].collision!.x++; },
    day => { day.scenes[0].world!.ground[0] = "c".repeat(20); },
    day => { day.scenes[0].interactionPack!.catalog.assets[0].src = "rose-v2.png"; },
    day => { day.scenes[0].interactionPack!.catalog.assets[1].frameMs = 200; },
    day => { day.scenes[0].interactionPack!.actions[0].label = "Choose a rose"; },
    day => { day.scenes[0].interactionPack!.actions[0].steps[0] = { type: "say", text: "A different flower." }; },
    day => { day.journeys![0].legs[0] = { mode: "bus", route: "25", destination: "B stop", from: "A stop", to: "B stop" }; },
    day => { day.journeys![0].departure.approach.x--; },
    day => { day.scenes[0].food = { sprite: "lunch.png", tile: { x: 8, y: 8 }, text: "A different meal." }; },
    day => { day.date = "2026-11-02"; },
  ];
  const scopes = new Set<string>();
  for (const change of changes) {
    const revised = structuredClone(base); change(revised);
    const revisedScope = dayProgressScope(revised);
    assert.notEqual(revisedScope, scope);
    assert.equal(revised.id, base.id, "the revision must be detected without changing the day ID");
    scopes.add(revisedScope);
  }
  assert.equal(scopes.size, changes.length);
});

test("array ordering remains part of scene, route, catalog and action semantics", () => {
  const base = manifest(), scope = dayProgressScope(base);
  const variants = [
    (day: DayManifest) => day.scenes.reverse(),
    (day: DayManifest) => day.journeys![0].legs.reverse(),
    (day: DayManifest) => day.scenes[0].interactionPack!.catalog.assets.reverse(),
    (day: DayManifest) => day.scenes[0].interactionPack!.actions[0].steps.reverse(),
  ];
  for (const reorder of variants) { const day = structuredClone(base); reorder(day); assert.notEqual(dayProgressScope(day), scope); }
});

test("legacy and single-world manifests without optional systems also have stable scopes", () => {
  const day = manifest();
  day.scenes = [day.scenes[0]];
  delete day.scenes[0].id; delete day.scenes[0].interactionPack; delete day.journeys;
  const before = structuredClone(day);
  assert.equal(dayProgressScope(day), dayProgressScope(JSON.parse(JSON.stringify(day))));
  assert.deepEqual(day, before, "fingerprinting must not mutate a manifest");
  parseDayManifest(day, day.id);
  const legacy: DayManifest = { ...day, scenes: (["tourist", "meal", "park"] as const).map((kind, index) => ({
    kind, title: kind, time: "12:00", base: (["city", "street", "park"] as const)[index], spawn: { x: 2, y: 6 }, exit: { x: 19, y: 12 },
    landmarks: [0, 1, 2].map(slot => ({ name: `Place ${slot}`, sprite: `place_${slot}.png`, footprint: "S", slot, text: "A remembered place." })),
  })), transit: [0, 1].map(() => ({ legs: [{ mode: "bus", route: "24", destination: "B", from: "A", to: "B" }] })) };
  parseDayManifest(legacy, legacy.id);
  assert.equal(dayProgressScope(legacy), dayProgressScope(reverseObjectKeys(legacy) as DayManifest));
});
