import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldContext, partOfDay, seasonOf } from "../pipeline/world-context";
import { directWorld, type AgentRunner } from "../pipeline/world-director";
import { fallbackDesign } from "../pipeline/world-design";
import { mockScenePlan } from "../pipeline/scene-plan";

const blueprint = mockScenePlan({ landmark: Buffer.from("x"), lunch: Buffer.from("x") });
const ctx = buildWorldContext(blueprint, { name: "Sam", date: "2026-11-07" });
const brief = { mood: "quiet and golden", standout: "a corner cafe", tone: "gentle", seasonal: "autumn light", cautions: ["do not name the cafe"] };
/** What the model returns: nullable library/description, as the structured-output schema requires. */
const good = () => {
  const d = fallbackDesign(ctx.scene.ground);
  return {
    interactables: d.interactables.map((i) => ({ ...i, library: i.library ?? null, description: null, near: ctx.anchors[0] })),
    npcs: d.npcs.map((n) => ({ ...n, library: n.library ?? null, description: null, near: "south_pavement" })),
  };
};
const runnerFor = (script: Record<string, unknown[]>): { runner: AgentRunner; calls: string[] } => {
  const calls: string[] = [];
  const counters: Record<string, number> = {};
  return { calls, runner: async ({ name }) => {
    calls.push(name);
    const list = script[name];
    const out = list[Math.min(counters[name] ?? 0, list.length - 1)];
    counters[name] = (counters[name] ?? 0) + 1;
    if (out instanceof Error) throw out;
    return out;
  } };
};

test("context: season, part of day and anchors come from the data", () => {
  assert.equal(seasonOf("2026-11-07"), "autumn");
  assert.equal(seasonOf("2026-11-07", -33), "spring");
  assert.equal(seasonOf("2026-01-02"), "winter");
  assert.equal(partOfDay("12:00"), "midday");
  assert.equal(ctx.environment.season, "autumn");
  assert.ok(ctx.anchors.includes("north_pavement") && ctx.anchors.includes(blueprint.buildings[0].id));
  assert.equal(ctx.location, undefined, "location is optional");
});

test("context: out-of-season sprites are not offered", () => {
  const ids = (c: typeof ctx) => c.library.map((a) => a.id);
  assert.ok(!ids(ctx).includes("snowman") && ids(ctx).includes("leaf_pile"));
  const winter = buildWorldContext(blueprint, { name: "Sam", date: "2026-01-02" });
  assert.ok(ids(winter).includes("snowman") && !ids(winter).includes("leaf_pile"));
});

test("director: brief, design, validator and critic approve, in order", async () => {
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: true, issues: [] }] });
  const run = await directWorld(ctx, runner);
  assert.equal(run.source, "agent");
  assert.deepEqual(run.trace.map((t) => t.agent), ["brief", "design", "validator", "critic"]);
  assert.equal(run.design.interactables.length, 3);
});

test("director: a rejected design is repaired with the feedback, then accepted", async () => {
  const bad = { ...good(), interactables: good().interactables.slice(0, 2) };
  const inputs: string[] = [];
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [bad, good()], "Design critic": [{ approved: true, issues: [] }] });
  const run = await directWorld(ctx, async (call) => { if (call.name === "World design") inputs.push(call.input); return runner(call); });
  assert.equal(run.source, "agent");
  assert.ok(JSON.parse(inputs[1]).feedback.some((f: string) => /exactly 3 interactables/.test(f)), "second attempt receives the validator's issues");
  assert.ok(run.trace.some((t) => t.agent === "validator" && t.summary === "rejected"));
});

test("director: critic rejections fall back after the repair budget", async () => {
  const { runner, calls } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: false, issues: ["feels generic"] }] });
  const run = await directWorld(ctx, runner);
  assert.equal(run.source, "fallback");
  assert.equal(calls.filter((c) => c === "World design").length, 3, "one attempt plus two repairs");
  assert.equal(run.trace.at(-1)!.agent, "fallback");
  assert.deepEqual(run.design, fallbackDesign(ctx.scene.ground));
});

test("director: a crash or bad output never throws, it falls back", async () => {
  const crashed = await directWorld(ctx, async () => { throw new Error("boom"); });
  assert.equal(crashed.source, "fallback");
  const garbage = await directWorld(ctx, async () => ({ nonsense: true }));
  assert.equal(garbage.source, "fallback");
});

test("director: a near value that is not a real anchor is rejected", async () => {
  const wrong = good(); wrong.interactables[0].near = "the moon";
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [wrong, good()], "Design critic": [{ approved: true, issues: [] }] });
  const run = await directWorld(ctx, runner);
  assert.ok(run.trace.find((t) => t.agent === "validator" && t.issues?.some((i) => /near/.test(i))));
});

import { simulateWorld } from "../pipeline/world-sim";
import type { Tier } from "../pipeline/world-director";

const simulate = (d: Parameters<typeof simulateWorld>[1]) => simulateWorld(blueprint, d);
const tuned = (edits: unknown[], approved = true) => ({ approved, notes: "reviewed", edits });
const noEdits = tuned([]);

test("tiers: first pass on the default model, repairs and tuning on the strong one", async () => {
  const bad = { ...good(), interactables: good().interactables.slice(0, 2) };
  const tiers: string[] = [];
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [bad, good()], "Design critic": [{ approved: true, issues: [] }], "World tuner": [noEdits] });
  await directWorld(ctx, async (call) => { tiers.push(`${call.name}:${call.tier as Tier}`); return runner(call); }, { simulate });
  assert.deepEqual(tiers, ["Scene brief:default", "World design:default", "World design:strong", "Design critic:default", "World tuner:strong"]);
});

test("tuner: inspects the real layout, and a valid move edit is applied", async () => {
  const seen: string[] = [];
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: true, issues: [] }],
    "World tuner": [tuned([{ id: "crossing_button", action: "move", near: "south_plaza", library: null, reason: "too exposed" }]), noEdits] });
  const run = await directWorld(ctx, async (call) => { if (call.name === "World tuner") seen.push(call.input); return runner(call); }, { simulate });
  assert.equal(run.source, "agent");
  const state = JSON.parse(seen[0]).state;
  assert.ok(state.exitReachable && state.actors.length === 5 && state.actors.every((a: { groundUnderfoot: string; reachable: boolean }) => a.reachable && !["road", "kerb", "water"].includes(a.groundUnderfoot)));
  assert.equal(run.design.interactables.find((i) => i.id === "crossing_button")!.near, "south_plaza");
  assert.ok(run.trace.some((t) => t.agent === "tuner") && run.trace.some((t) => t.agent === "inspector" && t.summary === "all clear"));
});

test("tuner: unsafe or invalid edits are ignored and the design survives", async () => {
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: true, issues: [] }],
    "World tuner": [tuned([{ id: "bench", action: "remove", near: null, library: null, reason: "x" }, { id: "nobody", action: "move", near: "the moon", library: null, reason: "x" }])] });
  const run = await directWorld(ctx, runner, { simulate });
  assert.equal(run.source, "agent");
  assert.equal(run.design.interactables.length, 3, "an interactable can never be removed");
});

test("tuner: a crash keeps the already-approved design", async () => {
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: true, issues: [] }], "World tuner": [new Error("model unavailable")] });
  const run = await directWorld(ctx, runner, { simulate });
  assert.equal(run.source, "agent");
  assert.equal(run.design.npcs.length, good().npcs.length);
});

test("inspector: characters that cannot stand safely are removed rather than shipped", async () => {
  const { runner } = runnerFor({ "Scene brief": [brief], "World design": [good()], "Design critic": [{ approved: true, issues: [] }], "World tuner": [noEdits] });
  const sim = (d: Parameters<typeof simulateWorld>[1]) => {
    const out = simulateWorld(blueprint, d);
    if (d.npcs.some((n) => n.id === "pigeon")) { const o = out.world.objects.find((x) => x.id === "pigeon")!; o.y = 250; } // 250 is the middle of the road
    return out;
  };
  const run = await directWorld(ctx, runner, { simulate: sim });
  assert.ok(!run.design.npcs.some((n) => n.id === "pigeon"), "the pigeon on the road was dropped");
  assert.ok(run.design.npcs.length >= 1);
});

test("deadline: a hung model falls back instead of hanging the job", async () => {
  const started = Date.now();
  const run = await directWorld(ctx, () => new Promise(() => {}), { simulate, deadlineMs: 80 });
  assert.equal(run.source, "fallback");
  assert.ok(Date.now() - started < 2000);
  assert.match(run.trace.at(-1)!.summary, /ran out of time/);
});

test("the fallback is itself physically valid in every scene type", async () => {
  for (const ground of ["street", "park", "plaza"] as const) {
    const b = { ...blueprint, ground };
    const run = await directWorld(buildWorldContext(b, { name: "Sam", date: "2026-11-07" }), async () => { throw new Error("offline"); }, { simulate: (d) => simulateWorld(b, d) });
    assert.equal(run.source, "fallback");
    const sim = simulateWorld(b, run.design);
    assert.equal(sim.world.objects.filter((o) => o.role).length, run.design.interactables.length + run.design.npcs.length, `${ground}: all placed`);
  }
});
