import test from "node:test";
import assert from "node:assert/strict";
import { fallbackDesign, validateDesign, type WorldDesign } from "../pipeline/world-design";
import { ACTOR_LIBRARY } from "../lib/actor-library";
import { parseDayManifest } from "../lib/day";

const grounds = ["street", "park", "plaza"] as const;
const libraryIds = new Set(ACTOR_LIBRARY.map((actor) => actor.id));
const copy = (design: WorldDesign) => structuredClone(design);

function worldManifest(object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: "demo", date: "2026-11-07", player: { name: "LUCAS", sprite: "player.png" },
    scenes: [{
      kind: "park", title: "Park", time: "10:00", base: "park",
      spawn: { x: 10, y: 13 }, exit: { x: 19, y: 7 }, landmarks: [],
      world: { width: 20, height: 15, ground: Array.from({ length: 15 }, () => "g".repeat(20)), objects: [{ id: "obj", name: "Object", sprite: "obj.png", x: 100, y: 200, width: 32, height: 40, ...object }] },
      ...extra,
    }],
    transit: [],
  };
}

test("fallback designs for every ground pass the validator themselves", () => {
  for (const ground of grounds) {
    const design = fallbackDesign(ground);
    assert.equal(validateDesign(design, ground).ok, true, ground);
    assert.equal(design.interactables.length, 3, ground);
    assert.ok(design.npcs.length >= 1 && design.npcs.length <= 3, ground);
    for (const item of [...design.interactables, ...design.npcs]) {
      if (item.library) assert.ok(libraryIds.has(item.library), `${ground}: ${item.library} missing from ACTOR_LIBRARY`);
    }
  }
});

test("validateDesign rejects each broken design with issues", () => {
  const base = fallbackDesign("street");
  const cases: [string, (d: WorldDesign) => void][] = [
    ["only 2 interactables", (d) => d.interactables.pop()],
    ["unknown effect", (d) => { d.interactables[0].effect = "explode" as never; }],
    ["unknown library id", (d) => { d.interactables[0].library = "does_not_exist"; }],
    ["NPC id used as interactable", (d) => { d.interactables[0].library = "busker"; }],
    ["all interactables share one effect", (d) => d.interactables.forEach((i) => { i.effect = "sit"; })],
    ["link in text", (d) => { d.npcs[0].text = "Visit https://example.com today"; }],
    ["all-caps text", (d) => { d.interactables[0].text = "HELLO THERE FRIEND"; }],
    ["duplicate id", (d) => { d.interactables[1].id = d.interactables[0].id; }],
    ["no library and no description", (d) => { delete d.interactables[0].library; delete d.interactables[0].description; }],
    ["zero NPCs", (d) => { d.npcs = []; }],
  ];
  for (const [name, mutate] of cases) {
    const design = copy(base);
    mutate(design);
    const result = validateDesign(design, "street");
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.ok(result.issues.length > 0, name);
  }
});

test("validateDesign clamps NPC roam and trims whitespace in text", () => {
  const design = copy(fallbackDesign("park"));
  design.npcs[0].roam = 99;
  design.npcs[1].roam = -5;
  design.interactables[0].text = "  You   sit\n\tdown.  ";
  const result = validateDesign(design, "park");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.design.npcs[0].roam, 24);
  assert.equal(result.design.npcs[1].roam, 0);
  assert.equal(result.design.interactables[0].text, "You sit down.");
});

test("parseDayManifest accepts a valid world interactable and rejects malformed world objects", () => {
  assert.doesNotThrow(() => parseDayManifest(worldManifest({ role: "interactable", effect: "ring", text: "Ding!" }), "demo"));

  const rejected: [string, Record<string, unknown>][] = [
    ["interactable with effect outside the closed list", { role: "interactable", effect: "explode", text: "Boom" }],
    ["interactable with no text", { role: "interactable", effect: "ring" }],
    ["npc with 6 lines", { role: "npc", text: "Hi", lines: ["a", "b", "c", "d", "e", "f"] }],
    ["npc with roam 99", { role: "npc", text: "Hi", roam: 99 }],
    ["effect on an object with no role", { effect: "ring" }],
    ["role ghost", { role: "ghost", text: "Boo" }],
  ];
  for (const [name, object] of rejected) {
    assert.throws(() => parseDayManifest(worldManifest(object), "demo"), /Invalid/, name);
  }
});
