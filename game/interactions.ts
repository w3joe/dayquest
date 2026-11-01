import type { DayManifest, DayScene, Tile } from "../lib/day";
import { isSceneTileWalkable, sceneCanStep } from "../lib/day";
import type { InteractionAction, InteractionAsset, InteractionStep } from "../lib/interactions";
import { worldCollision } from "./world-layout";

export type AssetReference = { sceneId: string; assetId: string };
export type InteractionProgress = { version: 1; completed: string[]; hidden: string[]; carried: AssetReference | null };
export type InteractionRun = {
  sceneId: string; actionId: string; targetId: string;
  phase: "approach" | "steps" | "complete" | "cancelled";
  stepIndex: number; elapsedMs: number;
  direction?: "up" | "down" | "left" | "right";
  carried: AssetReference | null;
  objectState: "hidden" | "default";
};
export type InteractionEvent = { type: "approached" } | { type: "tick"; deltaMs: number } | { type: "confirm" } | { type: "cancel" };
export type WorldPoint = { x: number; y: number };
export const interactionStorageKey = (id: string) => `dayquest:interactions:${id}`;
export const interactionScope = (sceneId: string, id: string) => `${sceneId}/${id}`;
export const sceneInteractionId = (manifest: DayManifest, scene: DayScene) => scene.id ?? `scene-${manifest.scenes.indexOf(scene)}`;
export const emptyInteractionProgress = (): InteractionProgress => ({ version: 1, completed: [], hidden: [], carried: null });
export function lookupInteractionAsset(manifest: DayManifest, reference: AssetReference | null): InteractionAsset | undefined {
  if (!reference) return;
  return manifest.scenes.find(scene => sceneInteractionId(manifest, scene) === reference.sceneId)?.interactionPack?.catalog.assets.find(asset => asset.id === reference.assetId);
}
export function restoreInteractionProgress(manifest: DayManifest, saved?: unknown): InteractionProgress {
  const empty = emptyInteractionProgress();
  try {
    const value = typeof saved === "string" ? JSON.parse(saved) : saved;
    if (!value || typeof value !== "object" || value.version !== 1 || !Array.isArray(value.completed) || !Array.isArray(value.hidden)) return empty;
    const actions = new Set<string>(), targets = new Set<string>();
    for (const scene of manifest.scenes) {
      const id = sceneInteractionId(manifest, scene);
      for (const action of scene.interactionPack?.actions ?? []) { actions.add(interactionScope(id, action.id)); targets.add(interactionScope(id, action.targetId)); }
    }
    const completed = [...new Set<string>(value.completed.filter((key: unknown): key is string => typeof key === "string" && actions.has(key)))];
    const hidden = [...new Set<string>(value.hidden.filter((key: unknown): key is string => typeof key === "string" && targets.has(key)))];
    const reference = value.carried;
    const carried = reference && typeof reference.sceneId === "string" && typeof reference.assetId === "string" &&
      lookupInteractionAsset(manifest, reference)?.kind === "prop" ? { sceneId: reference.sceneId, assetId: reference.assetId } : null;
    return { version: 1, completed, hidden, carried };
  } catch { return empty; }
}
export function actionAvailable(action: InteractionAction, sceneId: string, progress: InteractionProgress): boolean {
  const done = (id: string) => progress.completed.includes(interactionScope(sceneId, id));
  return (action.repeatable || !done(action.id)) && (action.requires?.completed ?? []).every(done) && !(action.requires?.notCompleted ?? []).some(done);
}
export function nearbyInteractionActions(scene: DayScene, sceneId: string, progress: InteractionProgress, point: WorldPoint): InteractionAction[] {
  const nearby = (scene.interactionPack?.actions ?? []).filter(action => actionAvailable(action, sceneId, progress) &&
    Math.hypot(point.x - (action.approach.x * 16 + 8), point.y - (action.approach.y * 16 + 15)) <= 32);
  const nearest = nearby.sort((a, b) => Math.hypot(point.x - (a.approach.x * 16 + 8), point.y - (a.approach.y * 16 + 15)) -
    Math.hypot(point.x - (b.approach.x * 16 + 8), point.y - (b.approach.y * 16 + 15)))[0];
  return nearest ? nearby.filter(action => action.targetId === nearest.targetId) : [];
}
export function beginInteraction(sceneId: string, action: InteractionAction, progress: InteractionProgress): InteractionRun | null {
  if (!actionAvailable(action, sceneId, progress)) return null;
  return { sceneId, actionId: action.id, targetId: action.targetId, phase: "approach", stepIndex: 0, elapsedMs: 0,
    carried: progress.carried, objectState: progress.hidden.includes(interactionScope(sceneId, action.targetId)) ? "hidden" : "default" };
}
export function currentInteractionStep(run: InteractionRun, action: InteractionAction): InteractionStep | undefined {
  return run.phase === "steps" ? action.steps[run.stepIndex] : undefined;
}
function settleRun(run: InteractionRun, action: InteractionAction): InteractionRun {
  let next = run;
  for (let guard = 0; guard <= action.steps.length && next.phase === "steps"; guard++) {
    const step = action.steps[next.stepIndex];
    if (!step) return { ...next, phase: "complete", elapsedMs: 0 };
    if (step.type === "say" || step.type === "wait" || step.type === "animate") return next;
    if (step.type === "face") next = { ...next, direction: step.direction };
    else if (step.type === "attach") next = { ...next, carried: { sceneId: next.sceneId, assetId: step.assetId } };
    else if (step.type === "detach") next = { ...next, carried: null };
    else if (step.type === "setObject") next = { ...next, objectState: step.state };
    next = { ...next, stepIndex: next.stepIndex + 1, elapsedMs: 0 };
  }
  return next;
}
/** Visual mutations are staged inside the run. Only commitInteraction publishes durable outcomes. */
export function advanceInteraction(run: InteractionRun, action: InteractionAction, event: InteractionEvent): InteractionRun {
  if (run.phase === "complete" || run.phase === "cancelled") return run;
  if (event.type === "cancel") return { ...run, phase: "cancelled" };
  if (run.phase === "approach") return event.type === "approached" ? settleRun({ ...run, phase: "steps" }, action) : run;
  const step = currentInteractionStep(run, action);
  if (!step) return settleRun(run, action);
  if (event.type === "confirm") return step.type === "say" ? settleRun({ ...run, stepIndex: run.stepIndex + 1, elapsedMs: 0 }, action) : run;
  if (event.type !== "tick" || !Number.isFinite(event.deltaMs) || event.deltaMs <= 0) return run;
  let next = run, remaining = Math.min(event.deltaMs, 120_000);
  for (let guard = 0; guard <= action.steps.length && remaining > 0 && next.phase === "steps"; guard++) {
    const active = currentInteractionStep(next, action);
    if (!active || (active.type !== "wait" && active.type !== "animate")) break;
    const consumed = Math.min(remaining, Math.max(0, active.durationMs - next.elapsedMs));
    next = { ...next, elapsedMs: next.elapsedMs + consumed }; remaining -= consumed;
    if (next.elapsedMs < active.durationMs) break;
    next = settleRun({ ...next, stepIndex: next.stepIndex + 1, elapsedMs: 0 }, action);
  }
  return next;
}
export function commitInteraction(progress: InteractionProgress, run: InteractionRun, action: InteractionAction): InteractionProgress {
  if (run.phase !== "complete" || run.actionId !== action.id || !actionAvailable(action, run.sceneId, progress)) return progress;
  const key = interactionScope(run.sceneId, action.id), target = interactionScope(run.sceneId, action.targetId);
  return { version: 1, completed: [...new Set([...progress.completed, key])], carried: run.carried,
    hidden: run.objectState === "hidden" ? [...new Set([...progress.hidden, target])] : progress.hidden.filter(id => id !== target) };
}
export function visibleInteractionScene(scene: DayScene, sceneId: string, progress: InteractionProgress, run?: InteractionRun): DayScene {
  const hidden = new Set(progress.hidden.filter(key => key.startsWith(`${sceneId}/`)).map(key => key.slice(sceneId.length + 1)));
  if (run?.sceneId === sceneId && run.phase !== "cancelled") {
    if (run.objectState === "hidden") hidden.add(run.targetId); else hidden.delete(run.targetId);
  }
  return { ...scene, ...(scene.world ? { world: { ...scene.world, objects: scene.world.objects.filter(object => !hidden.has(object.id)) } } : {}),
    food: hidden.has("food") ? undefined : scene.food };
}
export function interactionPointBlocked(scene: DayScene, point: WorldPoint): boolean {
  if (!scene.world || worldCollision(scene.world, point.x, point.y)) return true;
  const food = scene.food?.tile;
  return Boolean(food && point.x + 4 > food.x * 16 && point.x - 4 < (food.x + 1) * 16 && point.y > food.y * 16 + 6 && point.y - 5 < (food.y + 1) * 16);
}
function segmentClear(scene: DayScene, from: WorldPoint, to: WorldPoint): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(length / 2));
  for (let i = 1; i <= steps; i++) if (interactionPointBlocked(scene, { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps })) return false;
  return true;
}
/** Four-neighbour BFS and swept feet collision; the avatar never teleports through scenery. */
export function findInteractionPath(scene: DayScene, from: WorldPoint, approach: Tile): WorldPoint[] | null {
  if (!scene.world || !isSceneTileWalkable(scene, approach)) return null;
  const feet = (tile: Tile) => ({ x: tile.x * 16 + 8, y: tile.y * 16 + 15 });
  const base = { x: Math.floor(from.x / 16), y: Math.floor(from.y / 16) }, candidates: Tile[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const tile = { x: base.x + dx, y: base.y + dy };
    if (isSceneTileWalkable(scene, tile) && segmentClear(scene, from, feet(tile))) candidates.push(tile);
  }
  const start = candidates.sort((a, b) => Math.hypot(feet(a).x - from.x, feet(a).y - from.y) - Math.hypot(feet(b).x - from.x, feet(b).y - from.y))[0];
  if (!start) return null;
  const key = (tile: Tile) => `${tile.x},${tile.y}`, queue = [start], parent = new Map<string, Tile | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i];
    if (tile.x === approach.x && tile.y === approach.y) {
      const path: WorldPoint[] = []; let current: Tile | null = tile;
      while (current) { path.unshift(feet(current)); current = parent.get(key(current)) ?? null; }
      return path.filter((point, index) => index > 0 || Math.hypot(point.x - from.x, point.y - from.y) > .5);
    }
    for (const neighbour of [{ x: tile.x - 1, y: tile.y }, { x: tile.x + 1, y: tile.y }, { x: tile.x, y: tile.y - 1 }, { x: tile.x, y: tile.y + 1 }]) {
      if (!parent.has(key(neighbour)) && sceneCanStep(scene, tile, neighbour)) { parent.set(key(neighbour), tile); queue.push(neighbour); }
    }
  }
  return null;
}
