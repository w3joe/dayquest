import type { DayManifest } from "../lib/day";
import { parseDayManifest } from "../lib/day";
import { buildWorldLayout } from "../game/world-layout";
import { buildSceneAssetJobs, generateSceneAsset } from "./scene-assets";
import type { ImageGenerator } from "./imagegen";
import type { DayStore } from "./publish";
import type { SceneBlueprint, ScenePlanInput } from "./scene-types";
import type { GenerateEvent, UploadKind } from "./types";
import { validateInteractionPack, type InteractionPack } from "../lib/interactions";

export type WorldCheckpoint = {
  blueprint?: SceneBlueprint;
  /** Successfully stored filenames keyed by asset ID. Never mark a failed upload complete. */
  assets: Record<string, string>;
  /** Planned once, persisted before publication so a retry never repeats planning. */
  interactionPack?: InteractionPack;
};
export type WorldBuildInput = {
  id: string;
  date: string;
  name: string;
  uploads: Partial<Record<UploadKind, Buffer>>;
  player: Buffer;
};
export type WorldBuildDependencies = {
  plan(input: ScenePlanInput): Promise<SceneBlueprint>;
  images: ImageGenerator;
  store: DayStore;
  styleReferences?: Buffer[];
  /** Explicit production planner; omitted by legacy/offline pipeline consumers. */
  planInteractions?(scene: import("../lib/day").DayScene): Promise<InteractionPack>;
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
    const bytes = await generateSceneAsset(job, deps.images);
    await deps.store.put(job.file, bytes, "image/png");
    // Checkpoint updates are serialised so concurrent completions cannot discard one another.
    const completed = writes.then(async () => {
      const next = { ...latest, assets: { ...latest.assets, [job.id]: job.file } };
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
    const blueprint = await deps.plan({ landmark: input.uploads.landmark, lunch: input.uploads.lunch,
      context: { name: input.name, date: input.date } });
    const jobs = buildSceneAssetJobs(blueprint, input);
    return { checkpoint: { ...checkpoint, blueprint }, total: jobs.length,
      event: { step: "landmarks", label: `Scene planned: ${blueprint.title}. ${jobs.length} sprites to create.` } };
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
  const layout = buildWorldLayout(blueprint, checkpoint.assets);
  const scene = { kind: "tourist" as const, title: blueprint.title, time: blueprint.time,
    base: blueprint.ground === "park" ? "park" as const : "street" as const, spawn: layout.spawn, exit: layout.exit,
    landmarks: [], world: layout.world,
    ...(blueprint.food ? { food: { sprite: checkpoint.assets.food, icon: checkpoint.assets.food,
      tile: layout.foodTile, text: blueprint.food.text, name: blueprint.food.name, description: blueprint.food.description } } : {}) };
  if (deps.planInteractions && !checkpoint.interactionPack) {
    const interactionPack = await deps.planInteractions(scene);
    validateInteractionPack(scene, interactionPack);
    return { checkpoint: { ...checkpoint, interactionPack }, total: jobs.length,
      event: { step: "landmarks", label: `${interactionPack.actions.length} contextual interactions planned and saved.` } };
  }
  // The accepted fit-check sprite remains the preview/canonical character.
  await deps.store.put("player.png", input.player, "image/png");
  const manifest: DayManifest = {
    id: input.id, date: input.date,
    player: { name: input.name, sprite: "player.png", walkSheet: checkpoint.assets.player_walk },
    scenes: [{ ...scene, ...(checkpoint.interactionPack ? { interactionPack: checkpoint.interactionPack } : {}) }],
    transit: [],
  };
  parseDayManifest(manifest, input.id);
  await deps.store.put("day.json", Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  return { checkpoint, total: jobs.length, manifest, event: { step: "done", label: "Your world is ready to explore.", id: input.id } };
}
