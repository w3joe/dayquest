import { z } from "zod";
import { INTERACT_EFFECTS } from "../lib/day";
import { actorById } from "../lib/actor-library";
import { inspectWorld, worldState } from "../game/world-layout";
import { fallbackDesign, validateDesign, type WorldDesign } from "./world-design";
import type { WorldContext } from "./world-context";
import type { SimulatedWorld } from "./world-sim";

/**
 * The world builder. One structured context in, a validated and physically checked design out, every step recorded.
 *
 *   brief -> design -> validate -> critic -> simulate -> inspect -> tune -> re-inspect -> deliver
 *
 * Models choose WHAT appears and roughly WHERE (`near`); code decides exact positions, enforces physics, and has the last word.
 * It never throws: any failure degrades to a smaller, hand-written design that is itself inspected.
 * Repairs and the final tuning pass use a stronger model (default `gpt-6-astra`, set OPENAI_DIRECTOR_STRONG_MODEL) when the first pass is not enough.
 */
export type TraceStep = { agent: "brief" | "design" | "validator" | "critic" | "inspector" | "tuner" | "fallback"; summary: string; issues?: string[]; ms: number; model?: string };
export type SceneBrief = { mood: string; standout: string; tone: string; seasonal: string; cautions: string[] };
export type DirectorRun = { design: WorldDesign; brief?: SceneBrief; trace: TraceStep[]; source: "agent" | "fallback" };
export type Tier = "default" | "strong";
export type AgentRunner = (call: { name: string; instructions: string; input: string; schema: z.ZodType; tier: Tier }) => Promise<unknown>;
export type Simulate = (design: WorldDesign) => SimulatedWorld;

const MAX_REPAIRS = 2, MAX_TUNES = 2, DEFAULT_DEADLINE_MS = 90_000;
const nullableText = z.string().nullable();
const briefSchema = z.object({ mood: z.string(), standout: z.string(), tone: z.string(), seasonal: z.string(), cautions: z.array(z.string()) });
const designSchema = z.object({
  interactables: z.array(z.object({ id: z.string(), name: z.string(), library: nullableText, description: nullableText, effect: z.enum(INTERACT_EFFECTS), text: z.string(), near: z.string() })),
  npcs: z.array(z.object({ id: z.string(), name: z.string(), library: nullableText, description: nullableText, text: z.string(), lines: z.array(z.string()), roam: z.number(), near: z.string() })),
});
const criticSchema = z.object({ approved: z.boolean(), issues: z.array(z.string()) });
const tunerSchema = z.object({
  approved: z.boolean(), notes: z.string(),
  edits: z.array(z.object({ id: z.string(), action: z.enum(["move", "remove", "swap"]), near: nullableText, library: nullableText, reason: z.string() })),
});

const WORLD_RULES = `Physical and logical rules of this world (they are enforced in code, so break them and your work is rejected):
- People and animals stand on pavement, cobbles or grass, never on the road, kerb or water.
- Animals suit the place: swans and ducks on a park scene, squirrels near trees and lawns, pigeons on pavement near people, cats and dogs near people or buildings.
- Each thing's effect must match what it is: sit on a bench, feed at a bird feeder, shake a pile of leaves (autumn), light a lantern (best in evening, dusk or gloom), ring a bell, press a button at the crossing.
- Keep clear walking space around everything and never block the path to the exit.
- Weather and season decide what is sensible (no picnic in rain, no snowman outside winter).
- Use only facts in the context. Never invent a named business, person, event or route. Everything said is short, warm and kind.`;
const BRIEF = `You are the art director of a tiny, cosy pixel-art world built from one person's real day. You are given the full context of the scene.
Write a short brief for the designers: the mood, the one thing that makes this place feel specific and personal, the tone of voice for anything characters say, how the season and weather should show up, and cautions (things that must NOT be claimed because the context does not say them).
Be concrete and warm, one or two sentences per field. ${WORLD_RULES}`;
const DESIGN = `You design the living details of a cosy pixel-art scene: exactly 3 things the visitor can DO (interactables) and 1 to 3 small characters (NPCs).
You receive the full context and an art-director brief. Choose sprites from the library by id wherever possible.
Make each choice belong to THIS scene: set "near" to a building id or zone id from the context so it sits where it makes sense, and let what characters say reflect the place, season, weather and time of day without inventing facts.
Interactables use one of the allowed effects. NPCs get an opening line, 1 to 3 more lines, and a small roam radius (0 to 24).
If you receive feedback from a previous attempt, fix every point in it. ${WORLD_RULES}`;
const CRITIC = `You are a careful editor for a cosy, family-friendly pixel-art world. You receive the context, the brief and a proposed design.
Approve only if ALL are true: nothing states a fact the context does not support; the choices clearly fit this scene, season, weather and time of day; the things are varied; every line is warm, kind and short; each "near" sensibly matches what the thing is; physical and logical rules are respected. ${WORLD_RULES}
If not approved, list specific, actionable issues, one per entry.`;
const TUNER = `You are the final inspector. The world has been laid out by code, and you are shown its real state: where every character and thing actually stands (zone, ground underfoot, neighbours, whether the player can reach it), plus any physical problems the code found.
Judge it as a person would walking through it: does everything make sense where it is? Is anything out of place, lonely, cramped, illogical for the weather or season, or standing somewhere it would not?
You may only propose these edits: "move" (set a better "near" building or zone id), "remove" (a character only), or "swap" (a different library sprite id that suits the scene). Approve with no edits if it is already good. Edit only what genuinely needs it. ${WORLD_RULES}`;

const orNull = (v: string | null) => (v === null || v === "" ? undefined : v);
const normalise = (raw: z.infer<typeof designSchema>) => ({
  interactables: raw.interactables.map((i) => ({ ...i, library: orNull(i.library), description: orNull(i.description) })),
  npcs: raw.npcs.map((n) => ({ ...n, library: orNull(n.library), description: orNull(n.description) })),
});

const modelFor = (tier: Tier) => tier === "strong" ? process.env.OPENAI_DIRECTOR_STRONG_MODEL || "gpt-6-astra" : process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";

/** Production runner: one Agents SDK agent per call with structured output. A strong-tier failure retries once on the default model. */
export function agentsRunner(): AgentRunner {
  const once = async (name: string, instructions: string, input: string, schema: z.ZodType, model: string) => {
    const { Agent, run } = await import("@openai/agents");
    const agent = new Agent({ name, instructions, model, outputType: schema as z.ZodObject<z.ZodRawShape> });
    const result = await run(agent, input);
    return result.finalOutput;
  };
  return async ({ name, instructions, input, schema, tier }) => {
    try { return await once(name, instructions, input, schema, modelFor(tier)); }
    catch (error) {
      if (tier === "default") throw error;
      return once(name, instructions, input, schema, modelFor("default"));
    }
  };
}

export async function directWorld(ctx: WorldContext, runner: AgentRunner = agentsRunner(), options: { simulate?: Simulate; deadlineMs?: number } = {}): Promise<DirectorRun> {
  const trace: TraceStep[] = [];
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("world builder ran out of time")), options.deadlineMs ?? DEFAULT_DEADLINE_MS).unref?.());
  try { return await Promise.race([run(ctx, runner, options.simulate, trace), timeout]); }
  catch (error) { return fallback(ctx, trace, error instanceof Error ? error.message.slice(0, 160) : "world builder failed", options.simulate); }
}

async function run(ctx: WorldContext, runner: AgentRunner, simulate: Simulate | undefined, trace: TraceStep[]): Promise<DirectorRun> {
  const timed = async <T>(agent: TraceStep["agent"], model: string | undefined, fn: () => Promise<{ value: T; summary: string; issues?: string[] }>) => {
    const start = Date.now(), out = await fn();
    trace.push({ agent, summary: out.summary, issues: out.issues, ms: Date.now() - start, model });
    return out.value;
  };
  const brief = await timed("brief", modelFor("default"), async () => {
    const value = briefSchema.parse(await runner({ name: "Scene brief", instructions: BRIEF, input: JSON.stringify(ctx), schema: briefSchema, tier: "default" }));
    return { value, summary: value.mood };
  });

  let feedback: string[] = [], design: WorldDesign | undefined;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const tier: Tier = attempt === 0 ? "default" : "strong";
    const raw = await timed("design", modelFor(tier), async () => {
      const value = designSchema.parse(await runner({ name: "World design", instructions: DESIGN, input: JSON.stringify({ context: ctx, brief, feedback }), schema: designSchema, tier }));
      return { value, summary: `${value.interactables.length} interactables, ${value.npcs.length} characters${attempt ? ` (repair ${attempt})` : ""}` };
    });
    const checked = validateDesign(normalise(raw), ctx.scene.ground, ctx.anchors);
    await timed("validator", undefined, async () => ({ value: null, summary: checked.ok ? "passed" : "rejected", issues: checked.ok ? undefined : checked.issues }));
    if (!checked.ok) { feedback = checked.issues; continue; }
    const verdict = await timed("critic", modelFor("default"), async () => {
      const value = criticSchema.parse(await runner({ name: "Design critic", instructions: CRITIC, input: JSON.stringify({ context: ctx, brief, design: checked.design }), schema: criticSchema, tier: "default" }));
      return { value, summary: value.approved ? "approved" : "changes requested", issues: value.approved ? undefined : value.issues };
    });
    if (verdict.approved) { design = checked.design; break; }
    feedback = verdict.issues;
  }
  if (!design) return fallback(ctx, trace, "no design passed review", simulate, brief);

  if (simulate) design = await tune(ctx, brief, design, runner, simulate, trace, timed);
  return { design, brief, trace, source: "agent" };
}

type Timed = <T>(agent: TraceStep["agent"], model: string | undefined, fn: () => Promise<{ value: T; summary: string; issues?: string[] }>) => Promise<T>;

/** Look at the real, finished layout. Code finds hard problems; the strong model judges what a person would notice; both may only make small, safe edits. */
async function tune(ctx: WorldContext, brief: SceneBrief, start: WorldDesign, runner: AgentRunner, simulate: Simulate, trace: TraceStep[], timed: Timed): Promise<WorldDesign> {
  let design = start;
  try {
    for (let round = 0; round <= MAX_TUNES; round++) {
      const sim = simulate(design);
      const findings = inspectWorld(sim.world, sim.spawn, sim.exit);
      const placed = sim.world.objects.filter((o) => o.role).length;
      const expected = design.interactables.length + design.npcs.length;
      const problems = [...findings.map((f) => f.problem), ...(placed < expected ? [`only ${placed} of ${expected} things found a valid place`] : [])];
      trace.push({ agent: "inspector", summary: problems.length ? `${problems.length} problem(s)` : "all clear", issues: problems.length ? problems : undefined, ms: 0 });
      if (round === MAX_TUNES) break;
      const state = worldState(sim.world, sim.spawn, sim.exit, sim.buildings);
      const verdict = await timed("tuner", modelFor("strong"), async () => {
        const value = tunerSchema.parse(await runner({ name: "World tuner", instructions: TUNER, input: JSON.stringify({ context: ctx, brief, design, state, problems }), schema: tunerSchema, tier: "strong" }));
        return { value, summary: value.approved && !value.edits.length ? value.notes || "no changes" : `${value.edits.length} edit(s): ${value.notes}`, issues: value.edits.length ? value.edits.map((e) => `${e.action} ${e.id}: ${e.reason}`) : undefined };
      });
      const edited = applyEdits(ctx, design, verdict.edits);
      if (!verdict.edits.length && !problems.length) return design;
      if (edited) design = edited;
      else if (!problems.length) return design; // the tuner asked for something unsafe and nothing is wrong: keep what we have
    }
  } catch { /* the tuner is an improvement, never a requirement: keep the last good design */ }
  // Final guarantee: if hard problems remain, drop the offending characters; if that is not enough, the caller's fallback applies.
  const sim = simulate(design), bad = new Set(inspectWorld(sim.world, sim.spawn, sim.exit).map((f) => f.id));
  if (!bad.size) return design;
  const trimmed = { ...design, npcs: design.npcs.filter((n) => !bad.has(n.id)) };
  const again = simulate(trimmed);
  const stillBad = inspectWorld(again.world, again.spawn, again.exit);
  if (!stillBad.length && trimmed.npcs.length >= 1) { trace.push({ agent: "inspector", summary: `removed ${design.npcs.length - trimmed.npcs.length} character(s) that could not stand safely`, ms: 0 }); return trimmed; }
  trace.push({ agent: "fallback", summary: "tuned design still unsafe; using the hand-written set", ms: 0 });
  return fallbackDesign(ctx.scene.ground);
}

/** Apply the tuner's edits through the same validator as any design; returns undefined if the result would be invalid. */
function applyEdits(ctx: WorldContext, design: WorldDesign, edits: z.infer<typeof tunerSchema>["edits"]): WorldDesign | undefined {
  let next: WorldDesign = { ...design, interactables: [...design.interactables], npcs: [...design.npcs] };
  for (const edit of edits) {
    const where = [...next.interactables, ...next.npcs].find((x) => x.id === edit.id);
    if (!where) return undefined;
    if (edit.action === "move") { if (!edit.near || !ctx.anchors.includes(edit.near)) return undefined; (where as { near?: string }).near = edit.near; }
    else if (edit.action === "remove") { if (!next.npcs.some((n) => n.id === edit.id)) return undefined; next = { ...next, npcs: next.npcs.filter((n) => n.id !== edit.id) }; }
    else if (!edit.library || !actorById(edit.library)) return undefined; else (where as { library?: string }).library = edit.library;
  }
  const checked = validateDesign(next, ctx.scene.ground, ctx.anchors);
  return checked.ok ? { ...checked.design, source: "agent" } : undefined;
}

function fallback(ctx: WorldContext, trace: TraceStep[], why: string, simulate?: Simulate, brief?: SceneBrief): DirectorRun {
  let design = fallbackDesign(ctx.scene.ground);
  trace.push({ agent: "fallback", summary: `using the hand-written set: ${why}`, ms: 0 });
  if (simulate) {
    // Even the fallback is inspected, and trimmed rather than shipped with a physical problem.
    const sim = simulate(design), bad = new Set(inspectWorld(sim.world, sim.spawn, sim.exit).map((f) => f.id));
    if (bad.size) design = { ...design, npcs: design.npcs.filter((n) => !bad.has(n.id)) };
  }
  return { design, brief, trace, source: "fallback" };
}
