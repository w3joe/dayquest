import assert from "node:assert/strict";
import test from "node:test";
import { compileInteractionPack, parseInteractionCatalog, validateInteractionCatalog, validateInteractionPack, type InteractionCatalog, type InteractionPack } from "../lib/interactions";
import { parseDayManifest, sceneReachableTiles, type DayScene } from "../lib/day";

function scene(): DayScene {
  return { id: "flower-shop", kind: "tourist", title: "The flower shop", time: "12:00", base: "street", landmarks: [], spawn: { x: 20, y: 12 }, exit: { x: 39, y: 20 },
    world: { width: 40, height: 28, ground: Array.from({ length: 28 }, () => "p".repeat(40)), objects: [
      { id: "flower_display", name: "Flower display", removable: true, sprite: "flowers.png", x: 376, y: 207, width: 32, height: 32,
        collision: { x: 364, y: 195, width: 24, height: 12 }, text: "A little flower display." },
    ] }, food: { sprite: "food.png", tile: { x: 19, y: 19 }, text: "Your lunch." } };
}
function catalog(): InteractionCatalog {
  return { version: 1, assets: [
    { id: "rose", src: "/interaction-library/rose.png", width: 16, height: 24, kind: "prop", anchor: { x: 8, y: 24 }, description: "A single red rose", tags: ["flower", "carry"] },
    { id: "reach", src: "/interaction-library/reach.png", width: 32, height: 48, kind: "pose", frames: 3, frameMs: 150 },
    { id: "sparkle", src: "/interaction-library/sparkle.png", width: 24, height: 24, kind: "effect", frames: 4, frameMs: 100 },
  ] };
}
function proposal() {
  return { actions: [{ id: "take_rose", targetId: "flower_display", label: "Take a rose", repeatable: false,
    steps: [{ type: "face", direction: "right" }, { type: "animate", assetId: "reach", durationMs: 450 },
      { type: "attach", assetId: "rose" }, { type: "animate", assetId: "sparkle", durationMs: 400 },
      { type: "say", text: "A rose to take with you." }, { type: "setObject", state: "hidden" }] }] };
}

test("compiler resolves a reachable nearby approach and accepts only explicitly supplied artwork", () => {
  const location = scene(), original = structuredClone(location), assets = catalog(), suggested = proposal();
  const pack = compileInteractionPack(location, suggested, assets);
  assert.equal(pack.version, 1);
  assert.equal(pack.actions[0].targetId, "flower_display");
  assert.ok(sceneReachableTiles(location).has(`${pack.actions[0].approach.x},${pack.actions[0].approach.y}`));
  validateInteractionPack(location, pack);
  assert.deepEqual(location, original, "compilation never hides objects, consumes food or changes the world");
  assert.equal("approach" in suggested.actions[0], false);
  pack.catalog.assets[0].tags!.push("changed");
  assert.deepEqual(assets.assets[0].tags, ["flower", "carry"], "pack must own a copy of its supplied catalogue");
});

test("empty catalogue supports dialogue inspection and food targets without inventing animations", () => {
  const location = scene();
  const pack = compileInteractionPack(location, { actions: [
    { id: "inspect", targetId: "flower_display", label: "Look at flowers", repeatable: true, approach: null, requires: null,
      steps: [{ type: "say", text: "A little flower display." }, { type: "wait", durationMs: 100 }] },
    { id: "remember_lunch", targetId: "food", label: "Remember lunch", repeatable: false, steps: [{ type: "say", text: "Your lunch." }] },
  ] }, { version: 1, assets: [] });
  assert.equal(pack.catalog.assets.length, 0);
  assert.equal(pack.actions.length, 2);
  assert.equal(pack.actions[0].requires, undefined);
  assert.deepEqual(pack.actions[0].steps.map(step => step.type), ["say", "wait"]);
  for (const steps of [[{ type: "animate", assetId: "reach", durationMs: 400 }], [{ type: "attach", assetId: "rose" }]]) {
    assert.throws(() => compileInteractionPack(location, { actions: [{ id: "a", targetId: "food", label: "Lunch", repeatable: false, steps }] }, { version: 1, assets: [] }), /supplied/);
  }
});

test("catalogue rejects unsafe URLs, duplicate IDs, invalid frames, pivots and unsupported metadata", () => {
  const mutations: ((value: InteractionCatalog) => void)[] = [
    value => { value.version = 2 as 1; },
    value => { value.assets[0].src = "javascript:alert(1)"; },
    value => { value.assets[0].src = "%2e%2e/private.png"; },
    value => { value.assets[0].src = "https://user:secret@example.com/art.png"; },
    value => { value.assets[1].id = value.assets[0].id; },
    value => { value.assets[0].id = "__proto__"; },
    value => { value.assets[0].width = 0; },
    value => { value.assets[0].height = Infinity; },
    value => { value.assets[1].frames = 33; },
    value => { value.assets[1].frameMs = 20; },
    value => { value.assets[0].anchor!.y = 25; },
    value => { value.assets[0].tags = ["x".repeat(41)]; },
  ];
  for (const mutate of mutations) { const value = catalog(); mutate(value); assert.throws(() => validateInteractionCatalog(value)); }
  const parsed = parseInteractionCatalog(catalog());
  assert.equal(parsed.assets[1].frames, 3);
  assert.throws(() => parseInteractionCatalog({ version: 1, assets: [], script: "run code" }));
});

test("malformed or incompatible commands and unsupported references cannot become executable steps", () => {
  const location = scene();
  const invalidSteps = [
    [{ type: "animate", assetId: "rose", durationMs: 400 }],
    [{ type: "attach", assetId: "reach" }],
    [{ type: "animate", assetId: "missing", durationMs: 400 }],
    [{ type: "face", direction: "diagonal" }],
    [{ type: "say", text: "" }],
    [{ type: "say", text: "x".repeat(401) }],
    [{ type: "wait", durationMs: 15001 }],
    [{ type: "wait", durationMs: NaN }],
    [{ type: "wait", durationMs: 99 }],
    [{ type: "setObject", state: "hidden", targetId: "other_building" }],
    [{ type: "detach", assetId: "rose" }],
    [{ type: "run", code: "delete everything" }],
    Array.from({ length: 13 }, () => ({ type: "wait", durationMs: 100 })),
    Array.from({ length: 3 }, () => ({ type: "wait", durationMs: 15000 })),
  ];
  for (const steps of invalidSteps) {
    assert.throws(() => compileInteractionPack(location, { actions: [{ id: "action", targetId: "flower_display", label: "Flowers", repeatable: false, steps }] }, catalog()));
  }
  const unknown = proposal(); unknown.actions[0].targetId = "unknown_object";
  assert.throws(() => compileInteractionPack(location, unknown, catalog()), /unknown object target/);
  assert.throws(() => compileInteractionPack(location, { ...proposal(), catalog: catalog() }, catalog()), /malformed proposal/);
});

test("conditional actions use bounded local IDs and reject cycles and contradictions", () => {
  const make = () => ({ actions: [
    { id: "inspect", targetId: "flower_display", label: "Inspect", repeatable: false, steps: [{ type: "say", text: "Flowers." }] },
    { id: "take", targetId: "flower_display", label: "Take", repeatable: false, requires: { completed: ["inspect"], notCompleted: [] }, steps: [{ type: "attach", assetId: "rose" }] },
  ] });
  assert.equal(compileInteractionPack(scene(), make(), catalog()).actions[1].requires?.completed?.[0], "inspect");
  for (const requires of [{ completed: ["take"] }, { completed: ["unknown"] }, { completed: ["inspect"], notCompleted: ["inspect"] }, { completed: ["inspect", "inspect"] }]) {
    const value = make(); value.actions[1].requires = requires as typeof value.actions[1]["requires"];
    assert.throws(() => compileInteractionPack(scene(), value, catalog()));
  }
  const cycle = make(); cycle.actions[0].requires = { completed: ["take"], notCompleted: [] };
  assert.throws(() => compileInteractionPack(scene(), cycle, catalog()), /cycle/);
});

test("blocked, distant and disconnected interaction approaches are rejected", () => {
  const location = scene(), pack = compileInteractionPack(location, proposal(), catalog());
  for (const approach of [{ x: 39, y: 27 }, { x: 23, y: 12 }, { x: 19, y: 19 }, { x: -1, y: 12 }]) {
    const bad = structuredClone(pack); bad.actions[0].approach = approach;
    assert.throws(() => validateInteractionPack(location, bad), /approach/);
  }
  const isolated = scene();
  isolated.world!.objects.push({ id: "wall", name: "Wall", sprite: "wall.png", x: 352, y: 448, width: 2, height: 448,
    collision: { x: 351, y: 0, width: 2, height: 448 } });
  assert.throws(() => compileInteractionPack(isolated, proposal(), catalog()), /no safe approach/);
  const ambiguous = scene(); ambiguous.world!.objects[0].id = "food";
  assert.throws(() => compileInteractionPack(ambiguous, { actions: [{ ...proposal().actions[0], targetId: "food" }] }, catalog()), /reserved/);
});

test("day manifests validate packs after geometry, with no circular import or partial acceptance", () => {
  const location = scene(); location.interactionPack = compileInteractionPack(location, proposal(), catalog());
  const manifest = { id: "interactive", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, scenes: [location], transit: [] };
  assert.equal(parseDayManifest(manifest, "interactive").scenes[0].interactionPack?.actions.length, 1);
  const malformed = structuredClone(manifest);
  (malformed.scenes[0].interactionPack as InteractionPack).actions[0].steps = [{ type: "animate", assetId: "not_supplied", durationMs: 400 }];
  assert.throws(() => parseDayManifest(malformed, "interactive"), /supplied/);
  const old = structuredClone(manifest); delete old.scenes[0].interactionPack;
  assert.equal(parseDayManifest(old, "interactive").scenes[0].interactionPack, undefined);
});

test("scene-author capability permits food/removable object outcomes and protects permanent scenery", () => {
  const location = scene();
  delete location.world!.objects[0].removable;
  for (const state of ["hidden", "default"]) {
    assert.throws(() => compileInteractionPack(location, { actions: [{ id: "change_building", targetId: "flower_display", label: "Change object", repeatable: false,
      steps: [{ type: "setObject", state }] }] }, catalog()), /permanent scenery/);
  }
  const inspect = compileInteractionPack(location, { actions: [{ id: "inspect", targetId: "flower_display", label: "Inspect", repeatable: true,
    steps: [{ type: "say", text: "A permanent part of this street." }] }] }, { version: 1, assets: [] });
  assert.equal(inspect.actions.length, 1);
  location.world!.objects[0].removable = false;
  assert.throws(() => compileInteractionPack(location, proposal(), catalog()), /permanent scenery/);
  const food = compileInteractionPack(location, { actions: [{ id: "eat_lunch", targetId: "food", label: "Finish lunch", repeatable: false,
    steps: [{ type: "say", text: "Lunch finished." }, { type: "setObject", state: "hidden" }] }] }, { version: 1, assets: [] });
  assert.equal(food.actions[0].targetId, "food");
  const invalid = scene();
  Reflect.set(invalid.world!.objects[0], "removable", "yes");
  assert.throws(() => parseDayManifest({ id: "invalid_capability", date: "2026-11-01", player: { name: "You", sprite: "player.png" }, scenes: [invalid], transit: [] }, "invalid_capability"), /Invalid scene world/);
});
