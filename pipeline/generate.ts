import { randomBytes } from "node:crypto";
import { parseDayManifest, type DayManifest, type DayScene } from "@/lib/day";
import { planWithLLM, templatePlan } from "./highlights";
import { foodPrompt, landmarkPrompt, mapLimit, mockImageGenerator, openAIImageGenerator, playerPrompt, type ImageGenerator, type ImageRequest } from "./imagegen";
import { BASE_LAYOUT, buildTransit } from "./layout";
import { pixelate, pngDataUrl, type PixelTarget } from "./pixelate";
import type { DayStore } from "./publish";
import { fetchWikipediaImage } from "./references";
import type { DayInput, DayPlan, GenerateEvent, UploadKind } from "./types";

export type PipelineOptions = {
  id: string;
  input: DayInput;
  store: DayStore;
  /** Live LLM highlight selection; otherwise the template plan. */
  livePlan: boolean;
  images: ImageGenerator;
  /** Fetch Wikipedia references (only useful when images are live). */
  references?: (title: string) => Promise<Buffer | null>;
  /** Sanitised user photos from the Today screen, by slot. */
  uploads?: Partial<Record<UploadKind, Buffer>>;
  /** C's finished 32×48 back-facing sprite. Missing → placeholder. */
  player?: Buffer;
};

/**
 * Pipeline mode from env. Defaults to mock everywhere so nothing spends credits by accident:
 *   PIPELINE_TEXT=live    real highlight/landmark LLM call
 *   PIPELINE_IMAGES=live  real gpt-image calls + Wikipedia references
 */
export function modeFromEnv(): Pick<PipelineOptions, "livePlan" | "images" | "references"> {
  const liveImages = process.env.PIPELINE_IMAGES === "live" && Boolean(process.env.OPENAI_API_KEY);
  return {
    livePlan: process.env.PIPELINE_TEXT === "live" && Boolean(process.env.OPENAI_API_KEY),
    images: liveImages ? openAIImageGenerator() : mockImageGenerator(),
    references: liveImages ? (title) => fetchWikipediaImage(title) : undefined,
  };
}

export function newDayId(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

const upper = (s: string) => s.toUpperCase();

type Job = ImageRequest & { file: string; targets: { file: string; target: PixelTarget }[]; wikiTitle?: string; photo?: Buffer };

/** Runs §3 steps 1–6, emitting §6.1 events. Resolves with the validated, published manifest. */
export async function runGenerateDay(opts: PipelineOptions, emit: (event: GenerateEvent) => void): Promise<DayManifest> {
  const { id, input, store, images, uploads = {} } = opts;

  // 1–2. Highlights + landmarks
  let plan: DayPlan;
  try {
    plan = opts.livePlan ? await planWithLLM(input) : templatePlan(input);
  } catch {
    plan = templatePlan(input);
  }
  emit({ step: "highlights", label: `PICKING TODAY'S 3 HIGHLIGHTS… ${plan.scenes.map((s) => upper(s.title)).join(" · ")}` });
  for (const scene of plan.scenes) {
    emit({ step: "landmarks", label: `FINDING LANDMARKS NEAR ${upper(scene.title)}… ${scene.landmarks.map((l) => upper(l.name)).join(" · ")}` });
  }

  // 3–5. One job per sprite: references → image → pixelate
  const scenePhoto: Record<DayScene["kind"], Buffer | undefined> = { tourist: uploads.landmark, meal: uploads.lunch, park: uploads.park };
  const jobs: Job[] = [];
  plan.scenes.forEach((scene, s) => {
    scene.landmarks.forEach((l) => jobs.push({
      kind: "landmark", name: l.name, prompt: landmarkPrompt(l.name, l.footprint), references: [],
      file: `s${s}_l${l.slot}.png`, targets: [{ file: `s${s}_l${l.slot}.png`, target: l.footprint }],
      wikiTitle: l.wikiTitle, photo: l.slot === 0 ? scenePhoto[scene.kind] : undefined,
    }));
    if (scene.food) jobs.push({
      kind: "food", name: scene.food.name, prompt: foodPrompt(scene.food.name), references: [], file: `s${s}_food.png`,
      targets: [{ file: `s${s}_food.png`, target: "food" }, { file: `s${s}_food_icon.png`, target: "foodIcon" }],
      photo: uploads.lunch,
    });
  });
  if (!opts.player) jobs.push({
    kind: "player", name: input.user.name, prompt: playerPrompt(), references: [],
    file: "player.png", targets: [{ file: "player.png", target: "player" }],
  });

  const fallback = mockImageGenerator();
  await mapLimit(jobs, 6, async (job) => {
    const wiki = job.wikiTitle && opts.references ? await opts.references(job.wikiTitle) : null;
    job.references = [wiki, job.photo].filter((b): b is Buffer => Boolean(b));
    let raw: Buffer;
    let note = "";
    try {
      raw = await images.generate(job);
    } catch {
      // A single failed sprite must not sink the day: use a placeholder and say so.
      raw = await fallback.generate(job);
      note = " (PLACEHOLDER)";
    }
    let thumb = "";
    for (const { file, target } of job.targets) {
      const sprite = await pixelate(raw, target);
      await store.put(file, sprite, "image/png");
      thumb ||= pngDataUrl(sprite);
    }
    emit({ step: "image", label: `PAINTING ${job.kind === "player" ? "YOUR CHARACTER" : upper(job.name)}…${note}`, thumb });
  });
  if (opts.player) await store.put("player.png", await pixelate(opts.player, "player"), "image/png");
  emit({ step: "pixelate", label: `PIXELATING… ${jobs.length} SPRITES ✓` });

  // 6. Manifest
  const manifest: DayManifest = {
    id,
    date: input.date,
    player: { name: input.user.name, sprite: "player.png" },
    scenes: plan.scenes.map((scene, s) => {
      const layout = BASE_LAYOUT[scene.base];
      return {
        kind: scene.kind, title: scene.title, time: scene.time, base: scene.base,
        spawn: layout.spawn, exit: layout.exit,
        landmarks: scene.landmarks.map((l) => ({ name: l.name, sprite: `s${s}_l${l.slot}.png`, footprint: l.footprint, slot: l.slot, text: l.text })),
        ...(scene.food ? { food: { sprite: `s${s}_food.png`, icon: `s${s}_food_icon.png`, tile: layout.food ?? { x: 9, y: 8 }, text: scene.food.text } } : {}),
      };
    }),
    transit: buildTransit(input.transport),
  };
  parseDayManifest(manifest, id);
  await store.put("day.json", Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  emit({ step: "done", label: "BUILDING YOUR WORLD…", id });
  return manifest;
}
