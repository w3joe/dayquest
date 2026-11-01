import type { DayManifest } from "../lib/day";
import { parseDayManifest } from "../lib/day";
import { buildWorldLayout } from "../game/world-layout";
import { buildSceneAssetJobs, generateSceneAsset } from "./scene-assets";
import type { ImageGenerator } from "./imagegen";
import type { DayStore } from "./publish";
import type { SceneBlueprint, ScenePlanInput } from "./scene-types";
import { buildWorldContext, type Environment } from "./world-context";
import { applyLocation, type Located } from "./locator";
import { looksDuplicate, spriteHash } from "./sprite-similarity";
import { templateFor } from "../game/world-layout";
import { fallbackDesign } from "./world-design";
import type { DirectorRun } from "./world-director";
import type { GenerateEvent, UploadKind } from "./types";

export type WorldCheckpoint = {
  blueprint?: SceneBlueprint;
  /** Successfully stored filenames keyed by asset ID. Never mark a failed upload complete. */
  assets: Record<string, string>;
  /** Perceptual hashes of the building sprites saved so far, to catch one picture drawn several times. */
  hashes?: Record<string, string>;
};
export type WorldBuildInput = {
  id: string;
  date: string;
  name: string;
  uploads: Partial<Record<UploadKind, Buffer>>;
  player: Buffer;
  /** Optional season, weather and location data. Location is optional: without it the world is built from the photos alone. */
  environment?: Environment;
};
export type WorldBuildDependencies = {
  plan(input: ScenePlanInput): Promise<SceneBlueprint>;
  images: ImageGenerator;
  store: DayStore;
  /** The world builder: full scene context in, validated design out. The hand-written fallback is used when absent or when it fails. */
  /** Researches the place (web search) and chooses the location template and the real neighbours. Optional and never required. */
  locator?: (blueprint: SceneBlueprint) => Promise<Located | undefined>;
  director?: (context: ReturnType<typeof buildWorldContext>, blueprint: SceneBlueprint) => Promise<DirectorRun>;
  styleReferences?: Buffer[];
};

/** Independent sprites run in a bounded batch. Save each success even if its neighbour fails. */
export async function advanceWorldAssetBatch(input: WorldBuildInput, checkpoint: WorldCheckpoint, deps: WorldBuildDependencies,
  save: (checkpoint: WorldCheckpoint, event: GenerateEvent, total: number) => Promise<void>, concurrency = 3): Promise<void> {
  if (!checkpoint.blueprint) throw new Error("Plan the scene before generating sprites.");
  const jobs = buildSceneAssetJobs(checkpoint.blueprint, { ...input, styleReferences: deps.styleReferences });
  const pending = jobs.filter(job => !checkpoint.assets[job.id]).slice(0, Math.max(1, Math.min(3, Math.floor(concurrency))));
  let latest = checkpoint;
  let writes = Promise.resolve();
  const results = await Promise.allSettled(pending.map(async job => {
    let bytes = await generateSceneAsset(job, deps.images);
    const isBuilding = job.id.startsWith("building_");
    // Checkpoint updates are serialised so concurrent completions cannot discard one another.
    const completed = writes.then(async () => {
      let hash = isBuilding ? await spriteHash(bytes) : undefined;
      if (hash && looksDuplicate(hash, latest.hashes)) {
        // Another building already looks like this one. Draw it once more, told to be clearly different; accept that result.
        bytes = await generateSceneAsset({ ...job, prompt: `${job.prompt} It MUST look completely different from the other buildings in this scene: a different shape, height, roof and colours.`, references: [] }, deps.images);
        hash = await spriteHash(bytes);
      }
      await deps.store.put(job.file, bytes, "image/png");
      const next = { ...latest, assets: { ...latest.assets, [job.id]: job.file }, ...(hash ? { hashes: { ...latest.hashes, [job.id]: hash } } : {}) };
      await save(next, { step: "image", label: `${job.name} saved`, thumb: `data:image/png;base64,${bytes.toString("base64")}` }, jobs.length);
      latest = next;
    });
    writes = completed.catch(() => {});
    await completed;
  }));
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

/** Inventory, one sprite, or final publication as an individually testable unit.
 * The live worker uses advanceWorldAssetBatch for parallel sprite generation.
 */
export async function advanceWorldBuild(input: WorldBuildInput, checkpoint: WorldCheckpoint, deps: WorldBuildDependencies): Promise<{
  checkpoint: WorldCheckpoint; event: GenerateEvent; total: number; manifest?: DayManifest;
}> {
  if (!checkpoint.blueprint) {
    const planned = await deps.plan({ landmark: input.uploads.landmark, lunch: input.uploads.lunch,
      context: { name: input.name, date: input.date } });
    // Understand where this is: only the photographed building keeps the photo; the others are the place's real neighbours, drawn from text.
    const located = await deps.locator?.(planned).catch(() => undefined);
    const base = applyLocation(planned, located);
    const run = await deps.director?.(buildWorldContext(base, { name: input.name, date: input.date }, { ...input.environment, ...(located ? { place: located.place } : {}) }), base).catch(() => undefined);
    const chosen = templateFor({ ground: base.ground, template: run?.template ?? base.template });
    const design = run?.design ?? fallbackDesign(chosen.grounds[0], chosen.zones);
    const blueprint = { ...base, design, template: chosen.id, ...(run?.composition ? { composition: run.composition } : {}) };
    const jobs = buildSceneAssetJobs(blueprint, input);
    return { checkpoint: { ...checkpoint, blueprint }, total: jobs.length,
      event: { step: "landmarks", label: `Scene planned: ${blueprint.title}. ${jobs.length} sprites to create. Added ${design.interactables.length} things to do and ${design.npcs.length} characters${design.source === "agent" ? ", designed for this place" : ""}.` } };
  }
  const blueprint = checkpoint.blueprint;
  const jobs = buildSceneAssetJobs(blueprint, { ...input, styleReferences: deps.styleReferences });
  const next = jobs.find(job => !checkpoint.assets[job.id]);
  if (next) {
    const bytes = await generateSceneAsset(next, deps.images);
    await deps.store.put(next.file, bytes, "image/png");
    return { checkpoint: { ...checkpoint, assets: { ...checkpoint.assets, [next.id]: next.file } }, total: jobs.length,
      event: { step: "image", label: `${next.name} saved`, thumb: `data:image/png;base64,${bytes.toString("base64")}` } };
  }
  // The accepted fit-check sprite remains the preview/canonical character.
  await deps.store.put("player.png", input.player, "image/png");
  const layout = buildWorldLayout(blueprint, checkpoint.assets);
  const manifest: DayManifest = {
    id: input.id, date: input.date,
    player: { name: input.name, sprite: "player.png", walkSheet: checkpoint.assets.player_walk },
    scenes: [{ kind: "tourist", title: blueprint.title, time: blueprint.time,
      base: blueprint.ground === "park" ? "park" : "street", spawn: layout.spawn, exit: layout.exit,
      landmarks: [], world: layout.world,
      ...(blueprint.food ? { food: { sprite: checkpoint.assets.food, icon: checkpoint.assets.food,
        tile: layout.foodTile, text: blueprint.food.text } } : {}) }],
    transit: [],
  };
  parseDayManifest(manifest, input.id);
  await deps.store.put("day.json", Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  return { checkpoint, total: jobs.length, manifest, event: { step: "done", label: "Your world is ready to explore.", id: input.id } };
}
