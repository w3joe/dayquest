import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_ZONES, buildWorldLayout, exitReachable } from "../game/world-layout";
import { actorById } from "../lib/actor-library";
import { mockScenePlan } from "../pipeline/scene-plan";
import { fallbackDesign } from "../pipeline/world-design";

function layoutFor(ground: "street" | "park" | "plaza", mutate?: (d: ReturnType<typeof fallbackDesign>) => void) {
  const blueprint = mockScenePlan({ landmark: Buffer.from("x"), lunch: Buffer.from("x") });
  blueprint.ground = ground;
  blueprint.design = fallbackDesign(ground);
  mutate?.(blueprint.design);
  const sprites: Record<string, string> = {};
  for (const b of blueprint.buildings) sprites[b.id] = `${b.id}.png`;
  for (const p of blueprint.props) sprites[p.id] = `${p.id}.png`;
  return { blueprint, layout: buildWorldLayout(blueprint, sprites) };
}
const actors = (l: ReturnType<typeof layoutFor>["layout"]) => l.world.objects.filter((o) => o.role);

for (const ground of ["street", "park", "plaza"] as const) {
  test(`${ground}: every designed actor is placed, the exit stays reachable, nothing overlaps`, () => {
    const { layout } = layoutFor(ground);
    const placed = actors(layout), design = fallbackDesign(ground);
    assert.equal(placed.length, design.interactables.length + design.npcs.length);
    assert.ok(exitReachable(layout.world, layout.spawn, layout.exit));
    for (const a of placed) for (const b of placed) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 24, `${a.id} and ${b.id} are too close`);
    }
    for (const a of placed) assert.ok(a.collision && a.x - a.width / 2 >= 0 && a.y - a.height >= 0, `${a.id} is inside the map`);
  });
}

test("nothing stands on the kerb strip", () => {
  const { layout } = layoutFor("street");
  for (const a of actors(layout)) {
    const above = layout.world.ground[Math.floor((a.y - 12) / 16)][Math.floor(a.x / 16)];
    assert.ok(above !== "r" && above !== "k", `${a.id} at ${a.x},${a.y} is on the kerb`);
  }
});

test("`near` puts things where the design asked", () => {
  const { layout } = layoutFor("street");
  const inZone = (id: string, zone: (typeof WORLD_ZONES)[number]) => {
    const o = layout.world.objects.find((x) => x.id === id)!;
    return o.x >= zone.x - 20 && o.x <= zone.x + zone.width + 20 && o.y >= zone.y - 20 && o.y <= zone.y + zone.height + 20;
  };
  const crossing = WORLD_ZONES.find((z) => z.id === "crossing_south")!;
  assert.ok(inZone("crossing_button", crossing), "the crossing button is by the crossing");
});

test("a library sprite uses its real size; a missing one needs a generated sprite", () => {
  const { layout } = layoutFor("street");
  const bench = layout.world.objects.find((o) => o.id === "bench")!;
  assert.deepEqual([bench.width, bench.height], [actorById("bench")!.width, actorById("bench")!.height]);
  assert.throws(() => layoutFor("street", (d) => { d.npcs[0] = { ...d.npcs[0], library: undefined, description: "a tall juggler" }; }), /Missing sprite for/);
});
