/**
 * End-to-end world build in-process. Default is OFFLINE (no network). `--live` calls OpenAI (run by a human only).
 *   npx tsx scripts/e2e-world.mts [--live] [--out public/days/e2e]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import { advanceWorldBuild, type WorldBuildDependencies, type WorldBuildInput, type WorldCheckpoint } from "../pipeline/world-build";
import { mockScenePlan, planScene } from "../pipeline/scene-plan";
import { mockImageGenerator, openAIImageGenerator } from "../pipeline/imagegen";
import type { DayStore } from "../pipeline/publish";
import { agentsRunner, directWorld, fallbackFor, type AgentRunner } from "../pipeline/world-director";
import { simulateWorld } from "../pipeline/world-sim";
import { parseDayManifest } from "../lib/day";
import type { UploadKind } from "../pipeline/types";

const args = process.argv.slice(2);
const live = args.includes("--live");
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : "public/days/e2e";
if (!outArg) throw new Error("--out needs a directory");
const root = process.cwd();
const out = path.resolve(root, outArg);
const id = path.basename(out);
if (live && !process.env.OPENAI_API_KEY) throw new Error("--live needs OPENAI_API_KEY in the environment (e.g. node --env-file=.env or export it).");

const store: DayStore = {
  manifestUrl: `/days/${id}/day.json`,
  async put(name, bytes) { await mkdir(out, { recursive: true }); await writeFile(path.join(out, name), bytes); },
};

// Photos: only those present; none is fine.
const uploads: Partial<Record<UploadKind, Buffer>> = {};
for (const kind of ["landmark", "lunch"] as const) {
  const bytes = await readFile(path.join(root, ".data", "e2e", `${kind}.jpg`)).catch(() => null);
  if (bytes) uploads[kind] = bytes;
}
console.log(`Mode: ${live ? "LIVE (OpenAI)" : "OFFLINE (mock)"}; photos: ${Object.keys(uploads).join(", ") || "none"}`);

const assets = path.join(root, "shadwell-25d", "assets");
const player = await sharp(await readFile(path.join(assets, "shawn.png"))).extract({ left: 0, top: 0, width: 32, height: 48 }).png().toBuffer();
const styleReferences = await Promise.all(["shop_cafe.png", "station.png"].map((f) => readFile(path.join(assets, f))));

/** Offline runner: returns valid designs derived from the real context; the composer fails so the template's default scenery is used. */
const offlineRunner = (ctx: Parameters<typeof fallbackFor>[0]): AgentRunner => async ({ name }) => {
  switch (name) {
    case "Scene brief": return { mood: "calm and bright", standout: "the main landmark", tone: "gentle", seasonal: "autumn light", cautions: [] };
    case "Scene composer": throw new Error("offline: use the template's default scenery");
    case "World design": {
      const d = fallbackFor(ctx);
      return {
        interactables: d.interactables.map((i) => ({ ...i, library: i.library ?? null, description: null, near: i.near })),
        npcs: d.npcs.map((n) => ({ ...n, library: n.library ?? null, description: null, near: n.near })),
      };
    }
    case "Design critic": return { approved: true, issues: [] };
    case "World tuner": return { approved: true, edits: [], notes: "offline: no changes" };
    default: throw new Error(`offline runner: unexpected agent ${name}`);
  }
};

/** The mock generator draws one silhouette; the walk sheet needs 3x4 clean frames, so offline it comes from the sample character artwork. */
async function offlineWalkSheet(): Promise<Buffer> {
  const cells = await Promise.all([...Array(12).keys()].map(async (i) => ({
    input: await sharp(await readFile(path.join(assets, "shawn.png"))).extract({ left: (i % 3) * 32, top: Math.floor(i / 3) * 48, width: 32, height: 48 })
      .resize(128, 192, { kernel: "nearest" }).png().toBuffer(),
    left: (i % 3) * 256 + 64, top: Math.floor(i / 3) * 256 + 32,
  })));
  return sharp({ create: { width: 768, height: 1024, channels: 4, background: "#00000000" } }).composite(cells).png().toBuffer();
}
const mock = mockImageGenerator();
const offlineImages: typeof mock = { live: false, generate: async (request) => request.kind === "player" ? offlineWalkSheet() : mock.generate(request) };

const openai = live ? new OpenAI({ timeout: 110_000, maxRetries: 0 }) : undefined;
const deps: WorldBuildDependencies = {
  plan: live ? (input) => planScene(input, new OpenAI({ timeout: 60_000, maxRetries: 0 })) : async (input) => mockScenePlan(input),
  images: live ? openAIImageGenerator(openai) : offlineImages,
  store, styleReferences,
  director: (context, blueprint) => directWorld(context, live ? agentsRunner() : offlineRunner(context),
    { simulate: (design, composition) => simulateWorld(blueprint, design, composition) }),
};
const input: WorldBuildInput = { id, date: "2026-11-07", name: "You", uploads, player };

let checkpoint: WorldCheckpoint = { assets: {} };
const start = Date.now();
let manifest;
let steps = 0;
while (!manifest) {
  if (++steps > 200) throw new Error("build did not finish within 200 steps");
  const result = await advanceWorldBuild(input, checkpoint, deps);
  checkpoint = result.checkpoint;
  manifest = result.manifest;
  console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s] ${result.event.step}: ${result.event.label}`);
}
parseDayManifest(JSON.parse(await readFile(path.join(out, "day.json"), "utf8")), id);
await writeFile(path.join(out, "PREVIEW.txt"), live
  ? "LIVE run: the scene plan, sprites and world design were generated by OpenAI from the prepared e2e photos.\n"
  : "OFFLINE run: mock scene plan, placeholder sprites and a scripted designer. No network calls were made and no photos were analysed.\n");

const blueprint = checkpoint.blueprint!;
const design = blueprint.design!;
const objects = manifest.scenes[0].world.objects ?? [];
console.log("\n--- Result ---");
console.log(`Scene title: ${blueprint.title}`);
console.log(`Template: ${blueprint.template}`);
console.log(`Objects: ${objects.length}`);
console.log(`NPCs (${design.npcs.length}): ${design.npcs.map((n) => n.name).join(", ")}`);
console.log(`Interactables (${design.interactables.length}): ${design.interactables.map((i) => i.name).join(", ")}`);
console.log(`Written to: ${out}`);
console.log(`Open: http://localhost:3000/day/${id}`);
