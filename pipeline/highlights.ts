import OpenAI from "openai";
import type { DayInput, DayPlan, PlannedScene } from "./types";

export const HIGHLIGHTS_PROMPT = "You are given one person's day in London (locations, photos, workouts, transport). Pick exactly 3 highlights, in this order: one touristy spot, one meal, one park. For each, choose the 3 most memorable, visually recognisable landmarks within ~300 m that would read well as a single pixel-art building or object. Give each a footprint (S/M/L) and a one-sentence, plain, first-person-past-tense textbox line grounded in the data. No jokes, no game references. For the meal, also name the food and write its textbox line. wikiTitle is the English Wikipedia article title for the landmark, or an empty string for generic objects such as a phone box.";

const KINDS = ["tourist", "meal", "park"] as const;
const BASES = { tourist: "city", meal: "street", park: "park" } as const;

const landmarkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "wikiTitle", "footprint", "text"],
  properties: {
    name: { type: "string" },
    wikiTitle: { type: "string" },
    footprint: { type: "string", enum: ["S", "M", "L"] },
    text: { type: "string" },
  },
};

/** Structured-output schema for the Responses API. Strict mode: every field required. */
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "time", "landmarks", "food"],
        properties: {
          kind: { type: "string", enum: [...KINDS] },
          title: { type: "string", description: "Short scene title, e.g. Touring Westminster" },
          time: { type: "string", description: "HH:MM the highlight started" },
          landmarks: { type: "array", minItems: 3, maxItems: 3, items: landmarkSchema },
          food: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["name", "text"],
            properties: { name: { type: "string" }, text: { type: "string" } },
          },
        },
      },
    },
  },
} as const;

/** Coerce model output into the shape the game needs: fixed kind order, base maps, unique slots 0–2. */
export function normalizePlan(raw: unknown): DayPlan {
  const scenes = (raw as { scenes?: unknown[] })?.scenes;
  if (!Array.isArray(scenes)) throw new Error("Plan has no scenes");
  const out = KINDS.map((kind): PlannedScene => {
    const scene = scenes.find((s) => (s as { kind?: string })?.kind === kind) as Record<string, any> | undefined;
    if (!scene || !Array.isArray(scene.landmarks) || scene.landmarks.length < 3) throw new Error(`Plan is missing a ${kind} scene`);
    const time = /^\d{2}:\d{2}$/.test(scene.time) ? scene.time : "12:00";
    return {
      kind,
      base: BASES[kind],
      title: String(scene.title || kind).slice(0, 40),
      time,
      landmarks: scene.landmarks.slice(0, 3).map((l: Record<string, any>, slot: number) => ({
        name: String(l.name).slice(0, 60),
        wikiTitle: l.wikiTitle ? String(l.wikiTitle) : undefined,
        footprint: ["S", "M", "L"].includes(l.footprint) ? l.footprint : "M",
        slot,
        text: String(l.text).slice(0, 200),
      })),
      food: kind === "meal" && scene.food?.name ? { name: String(scene.food.name), text: String(scene.food.text) } : undefined,
    };
  });
  if (!out[1].food) throw new Error("Plan is missing the meal's food");
  return { scenes: out };
}

/** Live: one Responses API call with structured output (§5.1). */
export async function planWithLLM(input: DayInput, client = new OpenAI({ timeout: 60_000, maxRetries: 1 })): Promise<DayPlan> {
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
    instructions: HIGHLIGHTS_PROMPT,
    input: JSON.stringify(input),
    text: { format: { type: "json_schema", name: "day_plan", strict: true, schema: PLAN_SCHEMA as unknown as Record<string, unknown> } },
  });
  return normalizePlan(JSON.parse(response.output_text));
}

/** Mock: the §2.1 template day, filled with numbers from input.json. Also the live fallback. */
export function templatePlan(input: DayInput): DayPlan {
  const walk = input.workouts.find((w) => w.type === "walk");
  const order = input.notes?.match(/order:\s*([^.]+)/i)?.[1]?.trim() || "tonkotsu ramen and gyoza";
  const walkLine = walk
    ? `Walked ${walk.distanceKm} km in ${walk.durationMin} minutes, ${walk.steps.toLocaleString("en-GB")} steps.`
    : "Took a long walk around the park.";
  return normalizePlan({
    scenes: [
      {
        kind: "tourist", title: "Touring Westminster", time: "10:00", food: null,
        landmarks: [
          { name: "Big Ben", wikiTitle: "Big Ben", footprint: "L", text: "Took a photo of Big Ben from Westminster Bridge." },
          { name: "London Eye", wikiTitle: "London Eye", footprint: "L", text: "Rode the London Eye. Clear view all the way to St Paul's." },
          { name: "Red phone box", wikiTitle: "Red telephone box", footprint: "S", text: "Walked past a classic red phone box on Parliament Square." },
        ],
      },
      {
        kind: "meal", title: "Ramen lunch", time: "12:40",
        food: { name: order, text: `Had ${order} at Kanada-Ya.` },
        landmarks: [
          { name: "Kanada-Ya", wikiTitle: "", footprint: "M", text: "Queued for lunch at Kanada-Ya on St Giles High Street." },
          { name: "Centre Point", wikiTitle: "Centre Point", footprint: "L", text: "Centre Point towered over the end of the street." },
          { name: "Red phone box", wikiTitle: "Red telephone box", footprint: "S", text: "Passed another red phone box on the way in." },
        ],
      },
      {
        kind: "park", title: "Walk in Regent's Park", time: "14:15", food: null,
        landmarks: [
          { name: "Queen Mary's Rose Garden", wikiTitle: "Queen Mary's Gardens", footprint: "M", text: "Walked through Queen Mary's Rose Garden." },
          { name: "Triton Fountain", wikiTitle: "", footprint: "M", text: "Stopped by the Triton Fountain." },
          { name: "Boating lake", wikiTitle: "Regent's Park", footprint: "L", text: walkLine },
        ],
      },
    ],
  });
}
