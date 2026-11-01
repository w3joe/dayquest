import { prepareWorldConstruction, needsConstructionUpgrade } from "./world-construction";
import { WorldPlacementError } from "../game/block-placement";
import { RequestError } from "../lib/server/errors";
import { buildWorldKit, furnitureBlock } from "../lib/world-kit";
import { parseDayManifest, type DayManifest, type DayScene } from "../lib/day";
import type { SceneWeather } from "../lib/weather";
import { attachJourneys, type JourneyConnection } from "../lib/itinerary";
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
import { validateInteractionPack, type InteractionPack } from "../lib/interactions";
import { sceneUnits, type SceneUnit } from "./scene-sources";

export type WorldCheckpoint = {
  blueprint?: SceneBlueprint;
  /** Successfully stored filenames keyed by asset ID. Never mark a failed upload complete. */
  assets: Record<string, string>;
  /** Planned once, persisted before publication so a retry never repeats planning. */
  interactionPack?: InteractionPack;
  /** Perceptual hashes of the building sprites saved so far, to catch one picture drawn several times. */
  hashes?: Record<string, string>;
  /** Completed photo-scenes waiting for the rest of the day, or for publication. */
  completedScenes?: DayScene[];
};
export type WorldBuildInput = {
  id: string;
  date: string;
  name: string;
  uploads: Partial<Record<UploadKind, Buffer>>;
  /** Every submitted photo and its note, in upload order; first per slot is canonical. */
  photos?: { kind: UploadKind; bytes: Buffer; note?: string }[];
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
  /** Explicit production planner; omitted by legacy/offline pipeline consumers. */
  planInteractions?(scene: import("../lib/day").DayScene): Promise<InteractionPack>;
  weather?: (query: { time: string; photo?: Buffer }) => Promise<SceneWeather | undefined>;
};

function planInputFor(input: WorldBuildInput, unit: SceneUnit): ScenePlanInput {
  const meal = unit.photoKind === "lunch";
  const notes = unit.note ?? (sceneUnits(input).length === 1 ? input.environment?.notes : undefined);
  return {
    ...(meal ? { lunch: unit.bytes } : unit.bytes ? { landmark: unit.bytes } : {}),
    focus: meal ? "meal" : "place", sceneId: unit.id, kind: unit.kind,
    context: { name: input.name, date: input.date, ...(notes ? { notes } : {}) },
  };
}

function assetSources(input: WorldBuildInput, unit: SceneUnit) {
  return {
    player: input.player,
    uploads: {
      ...(unit.photoKind === "lunch" ? { lunch: unit.bytes } : unit.bytes ? { landmark: unit.bytes } : {}),
      ...(input.uploads.fit ? { fit: input.uploads.fit } : {}),
    },
  };
}

function unitFor(input: WorldBuildInput, checkpoint: WorldCheckpoint): SceneUnit {
  const units = sceneUnits(input);
  return units.find(item => item.id === checkpoint.blueprint?.sceneId) ?? units[checkpoint.completedScenes?.length ?? 0] ?? units[0];
}

function scopedJobs(input: WorldBuildInput, checkpoint: WorldCheckpoint, deps: WorldBuildDependencies, unit: SceneUnit) {
  const jobs = buildSceneAssetJobs(checkpoint.blueprint!, { ...assetSources(input, unit), styleReferences: deps.styleReferences });
  const pending = checkpoint.assets.player_walk ? jobs.filter(job => job.id !== "player_walk") : jobs;
  if (sceneUnits(input).length === 1) return pending;
  return pending.map(job => job.id === "player_walk" ? job : { ...job, file: `${unit.id}_${job.file}` });
}

/** Jobs remaining for the in-progress photo-scene, with per-scene filenames when a day has several. */
export function worldAssetJobs(input: WorldBuildInput, checkpoint: WorldCheckpoint, deps: WorldBuildDependencies) {
  if (!checkpoint.blueprint) return [];
  return scopedJobs(input, checkpoint, deps, unitFor(input, checkpoint));
}

function walkConnections(scenes: DayScene[]): JourneyConnection[] {
  return scenes.slice(0, -1).map((from, index) => {
    const to = scenes[index + 1];
    return { id: `${from.id}_to_${to.id}`, fromSceneId: from.id!, toSceneId: to.id!,
      legs: [{ mode: "walk" as const, from: from.title, to: to.title, durationMs: 4000, estimated: true as const }] };
  });
}

/** Independent sprites run in a bounded batch. Save each success even if its neighbour fails. */
export async function advanceWorldAssetBatch(input: WorldBuildInput, checkpoint: WorldCheckpoint, deps: WorldBuildDependencies,
  save: (checkpoint: WorldCheckpoint, event: GenerateEvent, total: number) => Promise<void>, concurrency = 3): Promise<void> {
  if (!checkpoint.blueprint) throw new Error("Plan the scene before generating sprites.");
  const jobs = worldAssetJobs(input, checkpoint, deps);
  const pending = jobs.filter(job => !checkpoint.assets[job.id]).slice(0, Math.max(1, Math.min(3, Math.floor(concurrency))));
  let latest = checkpoint;
  let writes = Promise.resolve();
  const results = await Promise.allSettled(pending.map(async job => {
    let bytes = await generateSceneAsset(job, deps.images);
    const isBuilding = job.id.startsWith("building_");
    // Checkpoint updates are serialised so concurrent completions cannot discard one another.
    const completed = writes.then(async () => {
      let hash = isBuilding ? await spriteHash(bytes) : undefined;
      const building = checkpoint.blueprint?.buildings.find(candidate => candidate.id === job.id);
      if (hash && deps.images.live && !building?.observed && looksDuplicate(hash, latest.hashes)) {
        // Another building already looks like this one. Draw it once more, told to be clearly different; accept that result.
        bytes = await generateSceneAsset({ ...job, prompt: `${job.prompt} Make this supporting building visibly distinct from the other buildings while preserving the supplied setting and style references.` }, deps.images);
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
  const units = sceneUnits(input);
  const done = checkpoint.completedScenes?.length ?? 0;
  if (!checkpoint.blueprint) {
    const unit = units[done] ?? units[0];
    const plannedInput = planInputFor(input, unit);
    const planned = await deps.plan(plannedInput);
    const located = await deps.locator?.(planned).catch(() => undefined);
    const base = prepareWorldConstruction(applyLocation(planned, located));
    const run = await deps.director?.(buildWorldContext(base, { name: input.name, date: input.date }, { ...input.environment, notes: plannedInput.context?.notes, ...(located ? { place: located.place } : {}) }), base).catch(() => undefined);
    const chosen = templateFor({ ground: base.ground, template: run?.template ?? base.template });
    const design = run?.design ?? fallbackDesign(chosen.grounds[0], chosen.zones);
    const blueprint: SceneBlueprint = { ...base, design, template: chosen.id, sceneId: unit.id, kind: unit.kind, ...(run?.composition ? { composition: run.composition } : {}) };
    blueprint.kit = buildWorldKit(blueprint);
    const jobs = scopedJobs(input, { ...checkpoint, blueprint }, deps, unit);
    return { checkpoint: { ...checkpoint, blueprint }, total: jobs.length,
      event: { step: "landmarks", label: `${units.length > 1 ? `Scene ${done + 1} of ${units.length}: ` : ""}Scene planned: ${blueprint.title}. ${jobs.length} sprites to create. Added ${design.interactables.length} things to do and ${design.npcs.length} characters${design.source === "agent" ? ", designed for this place" : ""}.` } };
  }
  const unit = unitFor(input, checkpoint);
  // Existing paid artwork is authoritative. Repair only construction context,
  // before interactions acquire geometry-dependent approach coordinates.
  if (!checkpoint.interactionPack && needsConstructionUpgrade(checkpoint.blueprint)) {
    checkpoint = { ...checkpoint, blueprint: prepareWorldConstruction(checkpoint.blueprint) };
  }
  const blueprint = checkpoint.blueprint!;
  const jobs = scopedJobs(input, checkpoint, deps, unit);
  const next = jobs.find(job => !checkpoint.assets[job.id]);
  if (next) {
    const bytes = await generateSceneAsset(next, deps.images);
    await deps.store.put(next.file, bytes, "image/png");
    return { checkpoint: { ...checkpoint, assets: { ...checkpoint.assets, [next.id]: next.file } }, total: jobs.length,
      event: { step: "image", label: `${next.name} saved`, thumb: `data:image/png;base64,${bytes.toString("base64")}` } };
  }
  let layout: ReturnType<typeof buildWorldLayout>;
  try { layout = buildWorldLayout(blueprint, checkpoint.assets); }
  catch (error) {
    if (!(error instanceof WorldPlacementError)) throw error;
    console.error("World layout failed", { code: error.code, objectId: error.objectId });
    throw new RequestError("Your sprites are saved, but the layout could not safely fit a photographed object. Retry to continue from your saved artwork.", 422);
  }
  const scene: DayScene = { id: unit.id, kind: unit.kind, title: blueprint.title, time: blueprint.time,
    base: blueprint.ground === "park" ? "park" : "street", spawn: layout.spawn, exit: layout.exit,
    landmarks: [], world: layout.world,
    ...(blueprint.food ? { food: { sprite: checkpoint.assets.food, icon: checkpoint.assets.food,
      tile: layout.foodTile, text: blueprint.food.text, name: blueprint.food.name, description: blueprint.food.description } } : {}) };
  if (deps.planInteractions && !checkpoint.interactionPack) {
    const interactionPack = await deps.planInteractions(scene);
    validateInteractionPack(scene, interactionPack);
    return { checkpoint: { ...checkpoint, interactionPack }, total: jobs.length,
      event: { step: "landmarks", label: `${interactionPack.actions.length} contextual interactions planned and saved.` } };
  }
  const kit = blueprint.kit ?? buildWorldKit(blueprint);
  const placed = layout.world.objects.map(object => {
    const block = layout.blockContexts[object.id]
      ?? furnitureBlock(object.id, object.name, object.sprite.split("/").pop()?.replace(/\.png$/, "") ?? "custom");
    return { ...block, id: object.id, footprint: object.collision ? { width: object.collision.width, depth: object.collision.height } : block.footprint, render: { ...block.render, width: object.width, height: object.height }, sprite: object.sprite,
      connections: block.connectsTo === "front_path" ? [{ kind: "path", x: object.x, y: object.y + 30, clearancePx: block.clearancePx }] : [],
      placement: { x: object.x, y: object.y, ...(object.collision ? { collision: object.collision } : {}) } };
  });
  await deps.store.put(units.length > 1 ? `${unit.id}-world-kit.json` : "world-kit.json", Buffer.from(JSON.stringify({ ...kit, blocks: placed,
    meal: blueprint.food ? { ...kit.blocks.find(block => block.id === "food"), sprite: checkpoint.assets.food, tile: layout.foodTile } : undefined,
    character: { ...kit.blocks.find(block => block.id === "player_walk"), sprite: "player.png", walkSheet: checkpoint.assets.player_walk },
  }, null, 2)), "application/json");
  let weather: SceneWeather | undefined;
  try { weather = await deps.weather?.({ time: blueprint.time, photo: unit.bytes ?? input.uploads.landmark }); } catch { /* Scene stays neutral. */ }
  const finished: DayScene = { ...scene, ...(checkpoint.interactionPack ? { interactionPack: checkpoint.interactionPack } : {}), ...(weather ? { weather } : {}) };
  const completed = [...(checkpoint.completedScenes ?? []), finished];
  if (completed.length < units.length) {
    const kept: Record<string, string> = {};
    if (checkpoint.assets.player_walk) kept.player_walk = checkpoint.assets.player_walk;
    return { checkpoint: { assets: kept, completedScenes: completed }, total: jobs.length,
      event: { step: "landmarks", label: `Scene ${completed.length} of ${units.length} ready: ${finished.title}.` } };
  }
  await deps.store.put("player.png", input.player, "image/png");
  const connected = attachJourneys(completed, walkConnections(completed));
  const manifest: DayManifest = {
    id: input.id, date: input.date,
    player: { name: input.name, sprite: "player.png", walkSheet: checkpoint.assets.player_walk },
    ...connected,
  };
  parseDayManifest(manifest, input.id);
  await deps.store.put("day.json", Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  return { checkpoint: { ...checkpoint, completedScenes: completed }, total: jobs.length, manifest, event: { step: "done", label: "Your world is ready to explore.", id: input.id } };
}
