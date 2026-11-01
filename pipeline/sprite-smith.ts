import sharp from "sharp";
import { z } from "zod";
import type { AgentRunner } from "./world-director";
import { mapLimit, type ImageGenerator } from "./imagegen";
import { pixelateSceneSprite } from "./pixelate";

export type SpriteRole = "npc" | "interactable" | "prop" | "building";
export type SpriteRequest = { id: string; name: string; description: string; role: SpriteRole; width: number; height: number;
  context: { sceneTitle: string; locationName: string; season?: string; weather?: string; mood?: string } };
export type SpriteResult = { id: string; png: Buffer; prompt: string; attempts: number };
export type SpriteFailure = { id: string; reason: string };
export type SmithDeps = { runner: AgentRunner; generator: ImageGenerator; references: Buffer[] };
export type SpriteCheck = { ok: boolean; problems: string[] };

const promptSchema = z.object({ prompt: z.string(), notes: z.string() });

const INSTRUCTIONS = `You are a sprite smith's prompt writer for a tiny pixel-art world. Write ONE image-generation prompt for ONE isolated subject on a transparent background.
Style: cute CHIBI pixel art matching the reference image: chunky square pixels, thick dark outline, 2-3 flat tones per colour, no dithering, steep top-down 3/4 view, light from top-left, soft warm palette.
Proportions: for people and animals use chibi proportions (big round head about as tall as the body, tiny body, short stubby limbs, big simple eyes). For props and buildings use squat toy-like shapes.
Content: the prompt must reflect the description and the scene context (location, season, weather, mood). Never invent real brand names or readable text beyond what the description says. The image must contain nothing but the subject: no ground, no shadow, no scenery, no extra characters. Keep it family-friendly.
The input JSON has "request" and "previousProblems". If previousProblems is non-empty, an earlier image failed automatic checks for those reasons: write a corrected prompt that fixes them (e.g. a fully transparent background, a single centred subject filling most but not all of the frame, fewer and flatter colours).
Return the prompt and short notes.`;

const clip = (s: string, n = 200) => s.length > n ? `${s.slice(0, n - 3)}...` : s;
const messageOf = (e: unknown) => clip(String(e instanceof Error ? e.message : e).replace(/\s+/g, " ").trim());

export async function checkSpritePng(png: Buffer, width: number, height: number): Promise<SpriteCheck> {
  const problems: string[] = [];
  let data: Buffer; let info: { width: number; height: number };
  try {
    const meta = await sharp(png).metadata();
    if (!meta.hasAlpha) problems.push("image has no alpha channel");
    ({ data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    if (info.width !== width || info.height !== height) problems.push(`wrong dimensions ${info.width}x${info.height}, expected ${width}x${height}`);
  } catch (e) {
    return { ok: false, problems: [`image could not be decoded: ${messageOf(e)}`] };
  }
  const { width: w, height: h } = info;
  const total = w * h;
  let opaque = 0; let ringTransparent = 0; let ring = 0;
  const colours = new Set<number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const solid = data[i + 3] >= 128;
    if (solid) { opaque++; colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); }
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { ring++; if (!solid) ringTransparent++; }
  }
  if (opaque === 0) problems.push("image is empty (fully transparent)");
  else {
    const cover = opaque / total;
    if (cover < 0.08) problems.push(`subject covers only ${Math.round(cover * 100)}% of the frame (too small)`);
    if (cover > 0.92) problems.push(`subject covers ${Math.round(cover * 100)}% of the frame (background not removed or subject too large)`);
    if (ring > 0 && ringTransparent / ring < 0.7) problems.push("border is not transparent (background was not removed)");
    if (colours.size > 48) problems.push(`too many colours (${colours.size} distinct, max 48)`);
  }
  return { ok: problems.length === 0, problems };
}

async function attempt(request: SpriteRequest, deps: SmithDeps, previousProblems: string[]): Promise<{ png: Buffer; prompt: string }> {
  const out = await deps.runner({ name: "Sprite smith", instructions: INSTRUCTIONS, input: JSON.stringify({ request, previousProblems }), schema: promptSchema, tier: "default" });
  const prompt = promptSchema.parse(out).prompt.trim().slice(0, 1500);
  if (!prompt) throw new Error("prompt writer returned an empty prompt");
  const raw = await deps.generator.generate({ prompt, references: deps.references, kind: "landmark", name: request.name });
  const png = await pixelateSceneSprite(raw, request.width, request.height);
  return { png, prompt };
}

export async function smithSprite(request: SpriteRequest, deps: SmithDeps): Promise<SpriteResult> {
  let problems: string[] = [];
  for (let n = 1; n <= 2; n++) {
    try {
      const { png, prompt } = await attempt(request, deps, problems);
      const check = await checkSpritePng(png, request.width, request.height);
      if (check.ok) return { id: request.id, png, prompt, attempts: n };
      problems = check.problems;
    } catch (e) {
      problems = [messageOf(e)];
    }
  }
  throw new Error(clip(`Sprite ${request.id} failed quality checks after 2 attempts: ${problems.join("; ")}`, 400));
}

export async function smithSprites(requests: SpriteRequest[], deps: SmithDeps, concurrency = 3): Promise<{ made: SpriteResult[]; failed: SpriteFailure[] }> {
  const limit = Math.max(1, Math.min(4, Math.floor(concurrency) || 1));
  const outcomes = await mapLimit(requests, limit, async (r): Promise<SpriteResult | SpriteFailure> => {
    try { return await smithSprite(r, deps); }
    catch (e) { return { id: r.id, reason: messageOf(e) }; }
  });
  const made: SpriteResult[] = []; const failed: SpriteFailure[] = [];
  for (const o of outcomes) ("png" in o ? made : failed).push(o as never);
  return { made, failed };
}
