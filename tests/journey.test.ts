import assert from "node:assert/strict";
import test from "node:test";
import type { DayManifest, JourneyLeg } from "../lib/day";
import { advanceJourney, ARRIVAL_MS, BOARDING_MS, checkpointJourney, journeyPhaseDuration, legDuration, restoreJourney, TRANSFER_MS } from "../game/journey";

function fixture(legs: JourneyLeg[] = [{ mode: "bus", route: "24", destination: "Lunch", from: "Morning", to: "Lunch" }]): DayManifest {
  return {
    id: "journey-test", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, transit: [],
    scenes: ["morning", "lunch", "evening"].map(id => ({ id, kind: "tourist", title: id, time: "12:00", base: "street", spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 }, landmarks: [] })),
    journeys: [{ id: "bus-to-lunch", fromSceneId: "morning", toSceneId: "lunch", departure: { kind: "bus_stop", label: "Morning", tile: { x: 34, y: 12 }, approach: { x: 33, y: 12 } },
      arrival: { kind: "bus_stop", label: "Lunch", tile: { x: 5, y: 12 }, approach: { x: 6, y: 12 } }, legs },
      { id: "walk-home", fromSceneId: "lunch", toSceneId: "evening", departure: { kind: "path", label: "Lunch", tile: { x: 34, y: 12 }, approach: { x: 33, y: 12 } },
        arrival: { kind: "path", label: "Home", tile: { x: 5, y: 12 }, approach: { x: 6, y: 12 } }, legs: [{ mode: "walk", from: "Lunch", to: "Home" }] }],
  };
}
const prompt = { type: "prompt", journeyId: "bus-to-lunch", nearby: true } as const;

test("boarding requires proximity and a second confirmation; repeated confirms cannot board twice", () => {
  const manifest = fixture(), initial = restoreJourney(manifest);
  assert.equal(advanceJourney(manifest, initial, { ...prompt, nearby: false }), initial);
  assert.equal(advanceJourney(manifest, initial, { type: "confirm" }), initial);
  assert.equal(advanceJourney(manifest, initial, { ...prompt, journeyId: "walk-home" }), initial);
  const offered = advanceJourney(manifest, initial, prompt);
  assert.equal(offered.phase, "prompt");
  assert.equal(advanceJourney(manifest, offered, { type: "cancel" }).phase, "exploring");
  const boarding = advanceJourney(manifest, offered, { type: "confirm" });
  assert.equal(boarding.phase, "boarding");
  assert.equal(advanceJourney(manifest, boarding, { type: "confirm" }), boarding);
  assert.equal(advanceJourney(manifest, boarding, prompt), boarding);
});

test("mixed bus, Tube transfers and walking complete once in order", () => {
  const manifest = fixture([
    { mode: "bus", route: "24", destination: "Station", from: "Morning", to: "Station", durationMs: 1000 },
    { mode: "tube", line: "Central", color: "#e32017", stations: ["Station", "Change"], durationMs: 1100 },
    { mode: "tube", line: "Northern", color: "#000000", stations: ["Change", "Exit"], durationMs: 1200 },
    { mode: "walk", from: "Exit", to: "Lunch", durationMs: 1300 },
  ]);
  let state = advanceJourney(manifest, advanceJourney(manifest, restoreJourney(manifest), prompt), { type: "confirm" });
  state = advanceJourney(manifest, state, { type: "tick", deltaMs: BOARDING_MS });
  assert.equal(state.phase, "riding"); assert.equal(state.legIndex, 0);
  for (let leg = 0; leg < 4; leg++) {
    state = advanceJourney(manifest, state, { type: "tick", deltaMs: journeyPhaseDuration(manifest, state) });
    if (leg < 3) {
      assert.equal(state.phase, "transfer"); assert.equal(state.legIndex, leg + 1);
      state = advanceJourney(manifest, state, { type: "tick", deltaMs: TRANSFER_MS });
      assert.equal(state.phase, "riding");
    }
  }
  assert.equal(state.phase, "arriving"); assert.equal(state.sceneId, "lunch");
  state = advanceJourney(manifest, state, { type: "tick", deltaMs: ARRIVAL_MS });
  assert.equal(state.phase, "exploring"); assert.deepEqual(state.completed, ["bus-to-lunch"]);
  assert.equal(advanceJourney(manifest, state, prompt), state);
});

test("skip and oversized frames cannot duplicate arrival or advance the next journey", () => {
  const manifest = fixture();
  const boarding = advanceJourney(manifest, advanceJourney(manifest, restoreJourney(manifest), prompt), { type: "confirm" });
  let state = advanceJourney(manifest, boarding, { type: "skip" });
  assert.equal(state.sceneId, "lunch"); assert.equal(state.phase, "arriving");
  assert.equal(advanceJourney(manifest, state, { type: "skip" }), state);
  assert.equal(advanceJourney(manifest, state, { type: "confirm" }), state);
  state = advanceJourney(manifest, state, { type: "tick", deltaMs: 999_999 });
  assert.equal(state.sceneId, "lunch"); assert.equal(state.phase, "exploring");
  assert.deepEqual(state.completed, ["bus-to-lunch"]);
  const automatic = advanceJourney(manifest, boarding, { type: "tick", deltaMs: 999_999 });
  assert.equal(automatic.sceneId, "lunch"); assert.equal(automatic.phase, "exploring");
});

test("refresh during boarding or riding resumes at destination and sanitizes stored progress", () => {
  const manifest = fixture(), initial = restoreJourney(manifest);
  assert.equal(restoreJourney(manifest, "broken JSON").sceneId, "morning");
  assert.equal(restoreJourney(manifest, { version: 1, sceneId: "missing" }).sceneId, "morning");
  const offered = advanceJourney(manifest, initial, prompt);
  assert.equal(checkpointJourney(manifest, offered).sceneId, "morning");
  const boarding = advanceJourney(manifest, offered, { type: "confirm" });
  const resumed = restoreJourney(manifest, JSON.stringify(checkpointJourney(manifest, boarding)));
  assert.equal(resumed.sceneId, "lunch"); assert.equal(resumed.phase, "exploring");
  assert.deepEqual(resumed.completed, ["bus-to-lunch"]);
  assert.deepEqual(restoreJourney(manifest, { version: 1, sceneId: "morning", completed: ["walk-home"] }).completed, []);
});

test("durations are bounded and invalid ticks cannot change state", () => {
  assert.equal(legDuration({ mode: "walk", from: "a", to: "b", durationMs: -1 }), 1000);
  assert.equal(legDuration({ mode: "walk", from: "a", to: "b", durationMs: 99999 }), 15000);
  const manifest = fixture(), initial = restoreJourney(manifest);
  for (const deltaMs of [NaN, Infinity, -1, 0]) assert.equal(advanceJourney(manifest, initial, { type: "tick", deltaMs }), initial);
});
