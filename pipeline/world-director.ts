import { z } from "zod";
import { INTERACT_EFFECTS } from "../lib/day";
import { actorById } from "../lib/actor-library";
import { FEATURE_KINDS, SHAPES, checkComposition, type Composition } from "../game/composition";
import { EXEMPLARS } from "./exemplars";
import { inspectWorld, worldState } from "../game/world-layout";
import { fallbackDesign, validateDesign, type WorldDesign } from "./world-design";
import type { PlaceFacts, WorldContext } from "./world-context";
import type { TemplateId } from "../game/layout-templates";
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
export type TraceStep = { agent: "brief" | "compose" | "design" | "validator" | "critic" | "inspector" | "tuner" | "fallback"; summary: string; issues?: string[]; ms: number; model?: string };
export type SceneBrief = { mood: string; standout: string; tone: string; seasonal: string; cautions: string[] };
export type DirectorRun = { design: WorldDesign; brief?: SceneBrief; trace: TraceStep[]; composition?: Composition; source: "agent" | "fallback"; /** Set by planWorld: the kind of place the builder chose. */ template?: TemplateId; place?: PlaceFacts };
export type Tier = "default" | "strong";
/** `webSearch` lets the agent look things up on the web. Whatever it reads is untrusted data, never instructions. */
export type AgentRunner = (call: { name: string; instructions: string; input: string; schema: z.ZodType; tier: Tier; webSearch?: boolean }) => Promise<unknown>;
export type Simulate = (design: WorldDesign, composition?: Composition) => SimulatedWorld;

const MAX_REPAIRS = 2, MAX_TUNES = 2, DEFAULT_DEADLINE_MS = 90_000;
const nullableText = z.string().nullable();
const briefSchema = z.object({ mood: z.string(), standout: z.string(), tone: z.string(), seasonal: z.string(), cautions: z.array(z.string()) });
const nullNum = z.number().nullable();
const composeSchema = z.object({
  ground: z.array(z.object({
    op: z.enum(["lawn", "water", "bed", "paving", "path"]), x: nullNum, y: nullNum, w: nullNum, h: nullNum, shape: z.enum(SHAPES).nullable(), flowers: nullNum, density: nullNum,
    pattern: z.enum(["plain", "border", "cross"]).nullable(), material: z.enum(["p", "c"]).nullable(), points: z.array(z.array(z.number())).nullable(), width: nullNum })),
  features: z.array(z.object({
    op: z.enum(["row", "grove", "place"]), kind: z.enum(FEATURE_KINDS), from: z.array(z.number()).nullable(), to: z.array(z.number()).nullable(), spacing: nullNum,
    cx: nullNum, cy: nullNum, count: nullNum, radius: nullNum, x: nullNum, y: nullNum })),
  intent: z.string(),
});
/** Models return one flat shape with nullable fields; turn it into the kit's strict operations. Anything malformed is caught by checkComposition. */
function normaliseComposition(raw: z.infer<typeof composeSchema>): unknown {
  const n = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  return {
    ground: raw.ground.map((g) => g.op === "path" ? { op: "path", points: g.points, width: g.width, material: g.material }
      : g.op === "lawn" ? { op: "lawn", x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h), shape: n(g.shape), flowers: n(g.flowers) ?? 0.3 }
      : g.op === "water" ? { op: "water", x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h), shape: n(g.shape) }
      : g.op === "bed" ? { op: "bed", x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h), density: n(g.density) ?? 0.5 }
      : { op: "paving", x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h), pattern: n(g.pattern), material: n(g.material) }),
    features: raw.features.map((f) => f.op === "row" ? { op: "row", kind: f.kind, from: f.from, to: f.to, spacing: f.spacing }
      : f.op === "grove" ? { op: "grove", kind: f.kind, cx: n(f.cx), cy: n(f.cy), count: n(f.count), radius: n(f.radius) } : { op: "place", kind: f.kind, x: n(f.x), y: n(f.y) }),
  };
}
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
const KIT = `THE SCENERY KIT (the only things you can use; tile coordinates, x to the right 0-39, y down 0-27):
Ground operations
- lawn {x,y,w,h,shape,flowers}: grass, with scattered flowers (0 to 1). shape is rect, ellipse or blob (blob is organic).
- water {x,y,w,h,shape}: a pond, lake or river reach (at least 3x3). Only replaces lawn, so paths and bridges stay.
- bed {x,y,w,h,density}: a flower bed on lawn (density 0.2 to 1).
- paving {x,y,w,h,pattern,material}: pattern plain, border or cross; material p (paving) or c (cobbles).
- path {points[2..8 tile points],width 1|2,material}: a footpath drawn through the points, only over lawn.
Feature operations (kind is one of tree, hedge, lamp, bollard, cycle_stand, aboard, bin_grey, bin_purple)
- row {kind,from,to,spacing}: a line of things every "spacing" tiles (2 to 12).
- grove {kind tree|hedge,cx,cy,count,radius}: a natural cluster.
- place {kind,x,y}: one thing.
Limits: at most 20 ground and 20 feature operations. Everything must stay on the map.`;
const COMPOSE_PRINCIPLES = `Compose like a landscape artist, not a CAD tool:
- Use organic shapes (blob, ellipse) for ponds, lakes and lawns; keep rect for rivers, canals and formal beds.
- Edge water with lawn and trees, never leave a pond as a lone shape on bare ground.
- Cluster trees in odd-numbered groves, line hedges and lamps along edges and paths, and leave open lawn to breathe. Asymmetry feels natural.
- The route (the paths in the map, the start S, the exit E, the building row B) is fixed by the skeleton. Never cover it, and keep it clear and open.
- The scene must feel like THIS place: take cues from the context (what the photos show, the place facts, the season, the weather).
- Do not overcrowd. A calm, believable scene beats a busy one.`;
const EXAMPLES = EXEMPLARS.map((e) => `EXAMPLE "${e.title}" (template ${e.template}): ${e.scene}\n${JSON.stringify(e.composition)}`).join("\n\n");
const COMPOSE = `You compose the scenery of a cosy pixel-art scene from a kit, on top of a fixed walkable skeleton.
You receive the full context, including "layout.map": a character map of the BARE skeleton of the scene (paths, buildings, start and exit only; ALL scenery is yours to add) (. grass, , flowers, = paving, # cobbles, ~ water, _ road, - kerb; B buildings, T trees, L lamps, S start, E exit).
Study the worked examples, then return a composition for THIS scene in the same vocabulary, plus a one-sentence "intent". If you receive feedback, fix every point.
${KIT}
${COMPOSE_PRINCIPLES}
${WORLD_RULES}
${EXAMPLES}`;
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

/** The hand-written set for this kind of place, with its `near` values mapped onto this template's zones. */
export const fallbackFor = (ctx: WorldContext): WorldDesign => fallbackDesign(ctx.template.grounds[0], ctx.layout.zones);
const orNull = (v: string | null) => (v === null || v === "" ? undefined : v);
const normalise = (raw: z.infer<typeof designSchema>) => ({
  interactables: raw.interactables.map((i) => ({ ...i, library: orNull(i.library), description: orNull(i.description) })),
  npcs: raw.npcs.map((n) => ({ ...n, library: orNull(n.library), description: orNull(n.description) })),
});

const modelFor = (tier: Tier) => tier === "strong" ? process.env.OPENAI_DIRECTOR_STRONG_MODEL || "gpt-6-astra" : process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";

/** Production runner: one Agents SDK agent per call with structured output. A strong-tier failure retries once on the default model. */
export function agentsRunner(): AgentRunner {
  const once = async (name: string, instructions: string, input: string, schema: z.ZodType, model: string, webSearch?: boolean) => {
    const { Agent, run, webSearchTool } = await import("@openai/agents");
    const agent = new Agent({ name, instructions, model, outputType: schema as z.ZodObject<z.ZodRawShape>, ...(webSearch ? { tools: [webSearchTool()] } : {}) });
    const result = await run(agent, input);
    return result.finalOutput;
  };
  return async ({ name, instructions, input, schema, tier, webSearch }) => {
    try { return await once(name, instructions, input, schema, modelFor(tier), webSearch); }
    catch (error) {
      if (tier === "default") throw error;
      return once(name, instructions, input, schema, modelFor("default"), webSearch);
    }
  };
}

export async function directWorld(ctx: WorldContext, runner: AgentRunner = agentsRunner(), options: { simulate?: Simulate; deadlineMs?: number } = {}): Promise<DirectorRun> {
  const trace: TraceStep[] = [];
  // After the deadline the work is abandoned: no further model calls are made and nothing more is added to the trace.
  const state: RunState = { cancelled: false };
  const guarded: AgentRunner = (call) => (state.cancelled ? Promise.reject(new Error("world builder was stopped")) : runner(call));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { state.cancelled = true; reject(new Error("world builder ran out of time")); }, options.deadlineMs ?? DEFAULT_DEADLINE_MS); timer.unref?.(); });
  try { return await Promise.race([run(ctx, guarded, options.simulate, trace, state), timeout]); }
  catch (error) { return { ...fallback(ctx, trace, error instanceof Error ? error.message.slice(0, 160) : "world builder failed", options.simulate), composition: state.composition }; }
  finally { clearTimeout(timer); }
}

type RunState = { cancelled: boolean; composition?: Composition };

async function run(ctx: WorldContext, runner: AgentRunner, simulate: Simulate | undefined, trace: TraceStep[], state: RunState): Promise<DirectorRun> {
  const note = (step: TraceStep) => { if (!state.cancelled) trace.push(step); };
  const timed = async <T>(agent: TraceStep["agent"], model: string | undefined, fn: () => Promise<{ value: T; summary: string; issues?: string[] }>) => {
    const start = Date.now(), out = await fn();
    note({ agent, summary: out.summary, issues: out.issues, ms: Date.now() - start, model });
    return out.value;
  };
  const brief = await timed("brief", modelFor("default"), async () => {
    const value = briefSchema.parse(await runner({ name: "Scene brief", instructions: BRIEF, input: JSON.stringify(ctx), schema: briefSchema, tier: "default" }));
    return { value, summary: value.mood };
  });

  // Compose the scenery from the kit. A failure here is never fatal: the template's own default scenery is used instead.
  let composition: Composition | undefined;
  {
    let composeFeedback: string[] = [];
    for (let attempt = 0; attempt <= MAX_REPAIRS && !composition; attempt++) {
      const tier: Tier = attempt === 0 ? "default" : "strong";
      try {
        const candidate = await timed("compose", modelFor(tier), async () => {
          const value = composeSchema.parse(await runner({ name: "Scene composer", instructions: COMPOSE, input: JSON.stringify({ context: ctx, brief, feedback: composeFeedback }), schema: composeSchema, tier }));
          return { value, summary: `${value.ground.length} ground, ${value.features.length} feature operations${attempt ? ` (repair ${attempt})` : ""}: ${value.intent}` };
        });
        const checked = checkComposition(normaliseComposition(candidate));
        const problems = checked.ok ? [] : checked.issues;
        if (checked.ok && simulate) {
          // Build the real layout with this scenery and the hand-written characters: the route must stay open and nothing may stand in water.
          const sim = simulate(fallbackFor(ctx), checked.composition);
          problems.push(...inspectWorld(sim.world, sim.spawn, sim.exit).map((f) => f.problem));
        }
        trace.push({ agent: "validator", summary: problems.length ? "scenery rejected" : "scenery passed", issues: problems.length ? problems : undefined, ms: 0 });
        if (!problems.length && checked.ok) { composition = checked.composition; state.composition = composition; } else composeFeedback = problems;
      } catch (error) { composeFeedback = [error instanceof Error ? error.message.slice(0, 200) : "composer failed"]; }
    }
    if (!composition) trace.push({ agent: "fallback", summary: "using the template's default scenery", ms: 0 });
  }
  const simulateWith: Simulate | undefined = simulate && ((d) => simulate(d, composition));

  let feedback: string[] = [], design: WorldDesign | undefined;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const tier: Tier = attempt === 0 ? "default" : "strong";
    try {
      const raw = await timed("design", modelFor(tier), async () => {
        const value = designSchema.parse(await runner({ name: "World design", instructions: DESIGN, input: JSON.stringify({ context: ctx, brief, feedback }), schema: designSchema, tier }));
        return { value, summary: `${value.interactables.length} interactables, ${value.npcs.length} characters${attempt ? ` (repair ${attempt})` : ""}` };
      });
      const checked = validateDesign(normalise(raw), ctx.template.grounds, ctx.anchors);
      await timed("validator", undefined, async () => ({ value: null, summary: checked.ok ? "passed" : "rejected", issues: checked.ok ? undefined : checked.issues }));
      if (!checked.ok) { feedback = checked.issues; continue; }
      const verdict = await timed("critic", modelFor("default"), async () => {
        const value = criticSchema.parse(await runner({ name: "Design critic", instructions: CRITIC, input: JSON.stringify({ context: ctx, brief, design: checked.design }), schema: criticSchema, tier: "default" }));
        return { value, summary: value.approved ? "approved" : "changes requested", issues: value.approved ? undefined : value.issues };
      });
      if (verdict.approved) { design = checked.design; break; }
      feedback = verdict.issues;
    } catch (error) {
      if (state.cancelled) throw error;
      feedback = [`the previous answer could not be used: ${error instanceof Error ? error.message.slice(0, 200) : "invalid output"}`];
    }
  }
  if (!design) return { ...fallback(ctx, trace, "no design passed review", simulateWith, brief), composition };

  if (simulateWith) design = await tune(ctx, brief, design, runner, simulateWith, trace, timed);
  return { design, brief, composition, trace, source: design.source === "fallback" ? "fallback" : "agent" };
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
  // Final guarantee: if hard problems remain, drop the offending characters; if that is not enough, use the hand-written set, trimmed the same way.
  const safe = (d: WorldDesign) => { try { const sim = simulate(d); return inspectWorld(sim.world, sim.spawn, sim.exit); } catch { return [{ id: "layout", problem: "the layout could not be built" }]; } };
  const trimToSafe = (d: WorldDesign): WorldDesign | undefined => {
    const bad = new Set(safe(d).map((f) => f.id));
    if (!bad.size) return d;
    const trimmed = { ...d, npcs: d.npcs.filter((n) => !bad.has(n.id)) };
    return !safe(trimmed).length && trimmed.npcs.length >= 1 ? trimmed : undefined;
  };
  const ok = trimToSafe(design);
  if (ok) { if (ok !== design) trace.push({ agent: "inspector", summary: `removed ${design.npcs.length - ok.npcs.length} character(s) that could not stand safely`, ms: 0 }); return ok; }
  trace.push({ agent: "fallback", summary: "tuned design still unsafe; using the hand-written set", ms: 0 });
  return trimToSafe(fallbackFor(ctx)) ?? fallbackFor(ctx);
}

/** Apply the tuner's edits through the same validator as any design; returns undefined if the result would be invalid. */
function applyEdits(ctx: WorldContext, design: WorldDesign, edits: z.infer<typeof tunerSchema>["edits"]): WorldDesign | undefined {
  // Clone every element: an edit that is later rejected must not leave the previous design modified.
  let next: WorldDesign = { ...design, interactables: design.interactables.map((i) => ({ ...i })), npcs: design.npcs.map((n) => ({ ...n })) };
  for (const edit of edits) {
    const where = [...next.interactables, ...next.npcs].find((x) => x.id === edit.id);
    if (!where) return undefined;
    if (edit.action === "move") { if (!edit.near || !ctx.anchors.includes(edit.near)) return undefined; (where as { near?: string }).near = edit.near; }
    else if (edit.action === "remove") { if (!next.npcs.some((n) => n.id === edit.id)) return undefined; next = { ...next, npcs: next.npcs.filter((n) => n.id !== edit.id) }; }
    else if (!edit.library || !actorById(edit.library)) return undefined; else (where as { library?: string }).library = edit.library;
  }
  const checked = validateDesign(next, ctx.template.grounds, ctx.anchors);
  return checked.ok ? { ...checked.design, source: "agent" } : undefined;
}

function fallback(ctx: WorldContext, trace: TraceStep[], why: string, simulate?: Simulate, brief?: SceneBrief): DirectorRun {
  let design = fallbackFor(ctx);
  trace.push({ agent: "fallback", summary: `using the hand-written set: ${why}`, ms: 0 });
  if (simulate) {
    // Even the fallback is inspected, and trimmed rather than shipped with a physical problem.
    try {
      const sim = simulate(design), bad = new Set(inspectWorld(sim.world, sim.spawn, sim.exit).map((f) => f.id));
      if (bad.size) design = { ...design, npcs: design.npcs.filter((n) => !bad.has(n.id)) };
    } catch { /* an unbuildable layout is reported by the caller; the fallback itself must not throw */ }
  }
  return { design, brief, trace, source: "fallback" };
}
