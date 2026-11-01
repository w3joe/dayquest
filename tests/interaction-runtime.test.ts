import assert from "node:assert/strict";
import test from "node:test";
import type { DayManifest, DayScene, Journey } from "../lib/day";
import type { InteractionAction } from "../lib/interactions";
import { actionAvailable, advanceInteraction, beginInteraction, buildInteractionChoices, commitInteraction, emptyInteractionProgress, findInteractionPath, interactionPointBlocked, interactionScope, nearbyInteractionActions, restoreInteractionProgress, visibleInteractionScene } from "../game/interactions";

const take: InteractionAction = { id: "take", targetId: "snack", label: "Take snack", repeatable: false, approach: { x: 5, y: 6 }, steps: [
  { type: "face", direction: "right" }, { type: "attach", assetId: "snack_prop" }, { type: "wait", durationMs: 100 }, { type: "setObject", state: "hidden" }, { type: "say", text: "A little something for the journey." },
] };
const put: InteractionAction = { id: "put", targetId: "snack", label: "Put away", repeatable: true, approach: { x: 5, y: 6 }, requires: { completed: ["take"] }, steps: [{ type: "detach" }, { type: "say", text: "Saved for later." }] };
function scene(id = "street"): DayScene { return { id, kind: "tourist", title: "Test street", time: "12:00", base: "street", spawn: { x: 2, y: 6 }, exit: { x: 19, y: 12 }, landmarks: [],
  world: { width: 20, height: 15, ground: Array(15).fill("p".repeat(20)), objects: [{ id: "snack", name: "Snack", removable: true, sprite: "snack.png", x: 104, y: 111, width: 16, height: 16, collision: { x: 96, y: 103, width: 16, height: 8 } }] },
  interactionPack: { version: 1, catalog: { version: 1, assets: [{ id: "snack_prop", src: "snack.png", width: 16, height: 16, kind: "prop" }] }, actions: [take, put] } }; }
const manifest = (): DayManifest => ({ id: "interactions-test", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, scenes: [scene(), scene("park")], transit: [] });

test("outcomes remain staged until the complete action and repeated confirms cannot duplicate them", () => {
  const progress = emptyInteractionProgress();
  let run = beginInteraction("street", take, progress)!;
  run = advanceInteraction(run, take, { type: "approached" });
  assert.equal(run.direction, "right"); assert.equal(run.carried?.assetId, "snack_prop");
  assert.deepEqual(commitInteraction(progress, run, take), progress);
  run = advanceInteraction(run, take, { type: "tick", deltaMs: 100 });
  assert.equal(run.objectState, "hidden"); assert.equal(run.phase, "steps");
  assert.deepEqual(progress.hidden, []); assert.equal(progress.carried, null);
  run = advanceInteraction(run, take, { type: "confirm" });
  assert.equal(run.phase, "complete");
  const saved = commitInteraction(progress, run, take);
  assert.deepEqual(saved.completed, ["street/take"]); assert.deepEqual(saved.hidden, ["street/snack"]);
  assert.deepEqual(saved.carried, { sceneId: "street", assetId: "snack_prop" });
  assert.equal(advanceInteraction(run, take, { type: "confirm" }), run);
  assert.equal(commitInteraction(saved, run, take), saved);
  assert.equal(beginInteraction("street", take, saved), null);
});

test("cancel and interrupted reload discard partial carried/hidden outcomes", () => {
  const initial = emptyInteractionProgress();
  let run = advanceInteraction(beginInteraction("street", take, initial)!, take, { type: "approached" });
  run = advanceInteraction(run, take, { type: "tick", deltaMs: 100 });
  const cancelled = advanceInteraction(run, take, { type: "cancel" });
  assert.equal(cancelled.phase, "cancelled"); assert.equal(commitInteraction(initial, cancelled, take), initial);
  assert.equal(visibleInteractionScene(scene(), "street", initial, cancelled).world!.objects.length, 1, "cancelled visual hides roll back");
  assert.deepEqual(restoreInteractionProgress(manifest(), JSON.stringify(initial)), initial);
  assert.deepEqual(initial, emptyInteractionProgress());
  assert.equal(advanceInteraction(cancelled, take, { type: "confirm" }), cancelled);
});

test("completion requirements and hidden props are scoped by scene while carried assets survive travel", () => {
  const world = manifest();
  let run = advanceInteraction(beginInteraction("street", take, emptyInteractionProgress())!, take, { type: "approached" });
  run = advanceInteraction(run, take, { type: "tick", deltaMs: 99999 });
  run = advanceInteraction(run, take, { type: "confirm" });
  const progress = commitInteraction(emptyInteractionProgress(), run, take);
  assert.equal(actionAvailable(put, "street", progress), true); assert.equal(actionAvailable(put, "park", progress), false);
  assert.equal(actionAvailable(take, "park", progress), true);
  const restored = restoreInteractionProgress(world, JSON.stringify(progress));
  assert.deepEqual(restored, progress);
  assert.equal(visibleInteractionScene(world.scenes[0], "street", restored).world!.objects.length, 0);
  assert.equal(interactionPointBlocked(world.scenes[0], { x: 104, y: 109 }), true, "hidden artwork leaves original collision geometry intact");
  assert.equal(visibleInteractionScene(world.scenes[1], "park", restored).world!.objects.length, 1);
  let release = advanceInteraction(beginInteraction("street", put, restored)!, put, { type: "approached" });
  assert.equal(release.carried, null); assert.deepEqual(restored.carried, progress.carried);
  release = advanceInteraction(release, put, { type: "confirm" });
  assert.equal(commitInteraction(restored, release, put).carried, null);
});

test("supplied pose/effect strips obey duration bounds without skipping dialogue", () => {
  const action: InteractionAction = { ...take, steps: [{ type: "animate", assetId: "provided_effect", durationMs: 200 }, { type: "wait", durationMs: 100 }, { type: "say", text: "Still needs acknowledgement." }] };
  let run = advanceInteraction(beginInteraction("street", action, emptyInteractionProgress())!, action, { type: "approached" });
  for (const deltaMs of [NaN, Infinity, -1, 0]) assert.equal(advanceInteraction(run, action, { type: "tick", deltaMs }), run);
  run = advanceInteraction(run, action, { type: "tick", deltaMs: 150 }); assert.equal(run.stepIndex, 0); assert.equal(run.elapsedMs, 150);
  run = advanceInteraction(run, action, { type: "tick", deltaMs: 99999 }); assert.equal(run.stepIndex, 2); assert.equal(run.phase, "steps");
  assert.equal(advanceInteraction(run, action, { type: "tick", deltaMs: 99999 }), run);
  assert.equal(advanceInteraction(run, action, { type: "confirm" }).phase, "complete");
});

test("automatic approaches find a swept collision-safe detour and fail safely when unreachable", () => {
  const world = scene();
  world.world!.objects.push({ id: "barrier", name: "Wall", sprite: "wall.png", x: 72, y: 112, width: 16, height: 64, collision: { x: 64, y: 48, width: 16, height: 64 } });
  const from = { x: 40, y: 111 }, path = findInteractionPath(world, from, take.approach);
  assert.ok(path); assert.ok(path.some(point => point.y > 112), "route must go around the wall");
  let previous = from;
  for (const point of path) {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y), count = Math.max(1, Math.ceil(distance));
    for (let i = 1; i <= count; i++) assert.equal(interactionPointBlocked(world, { x: previous.x + (point.x - previous.x) * i / count, y: previous.y + (point.y - previous.y) * i / count }), false);
    previous = point;
  }
  world.world!.objects[1].collision = { x: 64, y: 0, width: 16, height: 240 };
  assert.equal(findInteractionPath(world, from, take.approach), null);
});

test("nearby menus respect action availability and corrupt storage cannot grant unknown actions", () => {
  const world = scene(), progress = emptyInteractionProgress();
  assert.deepEqual(nearbyInteractionActions(world, "street", progress, { x: 88, y: 111 }).map(action => action.id), ["take"]);
  assert.deepEqual(nearbyInteractionActions(world, "street", progress, { x: 10, y: 10 }), []);
  assert.deepEqual(restoreInteractionProgress(manifest(), "not JSON"), progress);
  const parsed = restoreInteractionProgress(manifest(), { version: 1, completed: ["missing/action", "street/take"], hidden: ["bad/object"], carried: { sceneId: "park", assetId: "missing" } });
  assert.deepEqual(parsed.completed, [interactionScope("street", "take")]); assert.deepEqual(parsed.hidden, []); assert.equal(parsed.carried, null);
});


test("co-located travel and item actions remain separately selectable even with identical IDs", () => {
  const journey: Journey = { id: take.id, fromSceneId: "street", toSceneId: "park", departure: { kind: "bus_stop", label: "Street stop", tile: { x: 5, y: 7 }, approach: take.approach },
    arrival: { kind: "bus_stop", label: "Park stop", tile: { x: 5, y: 7 }, approach: take.approach }, legs: [{ mode: "bus", route: "24", destination: "Park", from: "Street stop", to: "Park stop" }] };
  const choices = buildInteractionChoices([take, put], journey);
  assert.equal(choices.length, 3);
  assert.deepEqual(choices[0], { kind: "travel", journeyId: take.id, label: "Travel to Park stop" });
  assert.deepEqual(choices[1], { kind: "action", action: take });
  assert.deepEqual(buildInteractionChoices([take]), [{ kind: "action", action: take }]);
  assert.deepEqual(buildInteractionChoices([]), []);
});

test("restored visibility and held props are limited to outcomes explicitly allowed by the pack", () => {
  const day = manifest(), street = day.scenes[0];
  street.world!.objects.push({ id: "building", name: "Permanent building", sprite: "building.png", x: 200, y: 100, width: 32, height: 64 },
    { id: "decoration", name: "Loose decoration", sprite: "decoration.png", x: 240, y: 100, width: 16, height: 16, removable: true });
  street.interactionPack!.catalog.assets.push({ id: "unused_prop", src: "unused.png", kind: "prop", width: 16, height: 16 });
  street.interactionPack!.actions.push({ ...take, id: "inspect_building", targetId: "building", steps: [{ type: "say", text: "Inspect only." }] },
    { ...take, id: "inspect_decoration", targetId: "decoration", steps: [{ type: "say", text: "Never hide this decoration." }] });
  const restored = restoreInteractionProgress(day, { version: 1, completed: ["street/take"], hidden: ["street/building", "street/decoration", "street/snack"], carried: { sceneId: "street", assetId: "unused_prop" } });
  assert.deepEqual(restored.hidden, ["street/snack"]);
  assert.equal(restored.carried, null, "an unused catalog prop is not a valid carried outcome");
  street.world!.objects[0].removable = false;
  assert.deepEqual(restoreInteractionProgress(day, restored).hidden, [], "a target that became permanent cannot stay hidden from old progress");
});
