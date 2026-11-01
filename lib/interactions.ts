import { isDayAsset, isDayId, isSceneTileWalkable, sceneReachableTiles, type DayScene, type Tile } from "./day";

export type InteractionAsset = {
  id: string;
  src: string;
  /** Per-frame dimensions; animated frames form one horizontal strip. */
  width: number;
  height: number;
  kind: "prop" | "pose" | "effect";
  frames?: number;
  frameMs?: number;
  anchor?: { x: number; y: number };
  description?: string;
  tags?: string[];
};
export type InteractionCatalog = { version: 1; assets: InteractionAsset[] };
export type InteractionDirection = "up" | "down" | "left" | "right";
export type InteractionStep =
  | { type: "face"; direction: InteractionDirection }
  | { type: "wait"; durationMs: number }
  | { type: "say"; text: string }
  | { type: "animate"; assetId: string; durationMs: number }
  | { type: "attach"; assetId: string }
  | { type: "detach" }
  | { type: "setObject"; state: "hidden" | "default" };
export type InteractionAction = {
  id: string;
  targetId: string;
  label: string;
  repeatable: boolean;
  approach: Tile;
  steps: InteractionStep[];
  requires?: { completed?: string[]; notCompleted?: string[] };
};
export type InteractionPack = { version: 1; catalog: InteractionCatalog; actions: InteractionAction[] };

export const INTERACTION_LIMITS = { assets: 64, actions: 32, steps: 12, stepMs: 15_000, actionMs: 30_000, reach: 32 } as const;
const forbiddenIds = new Set(["__proto__", "prototype", "constructor"]);
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown, min: number, max: number): value is number { return Number.isInteger(value) && (value as number) >= min && (value as number) <= max; }
function text(value: unknown, max = 400): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function id(value: unknown): value is string { return typeof value === "string" && isDayId(value) && !forbiddenIds.has(value); }
function keys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function invalid(reason: string): never { throw new Error(`Invalid interaction pack: ${reason}`); }

export function validateInteractionCatalog(value: unknown): asserts value is InteractionCatalog {
  if (!record(value) || !keys(value, ["version", "assets"]) || value.version !== 1 || !Array.isArray(value.assets) || value.assets.length > INTERACTION_LIMITS.assets) invalid("unsupported asset catalog");
  const ids = new Set<string>();
  for (const asset of value.assets) {
    if (!record(asset) || !keys(asset, ["id", "src", "width", "height", "kind", "frames", "frameMs", "anchor", "description", "tags"]) ||
      !id(asset.id) || ids.has(asset.id) || !isDayAsset(asset.src) || !integer(asset.width, 1, 256) || !integer(asset.height, 1, 256) ||
      !["prop", "pose", "effect"].includes(String(asset.kind)) || (asset.frames !== undefined && !integer(asset.frames, 1, 32)) ||
      (asset.frameMs !== undefined && !integer(asset.frameMs, 40, 2000)) || (asset.description !== undefined && !text(asset.description, 500))) invalid("malformed asset");
    if (asset.anchor !== undefined && (!record(asset.anchor) || !keys(asset.anchor, ["x", "y"]) ||
      !integer(asset.anchor.x, 0, asset.width) || !integer(asset.anchor.y, 0, asset.height))) invalid("asset anchor is outside its frame");
    if (asset.tags !== undefined && (!Array.isArray(asset.tags) || asset.tags.length > 8 || !asset.tags.every(tag => text(tag, 40)))) invalid("malformed asset tags");
    ids.add(asset.id);
  }
}
export function parseInteractionCatalog(value: unknown): InteractionCatalog {
  validateInteractionCatalog(value);
  return structuredClone(value);
}

type TargetBox = { x: number; y: number; width: number; height: number };
function targetBox(scene: DayScene, targetId: string): TargetBox {
  if (!scene.world) return invalid("actions require a world scene");
  if (targetId === "food" && scene.food) {
    if (scene.world.objects.some(object => object.id === "food")) return invalid("food target ID is reserved");
    return { x: scene.food.tile.x * 16, y: scene.food.tile.y * 16 + 6, width: 16, height: 10 };
  }
  const target = scene.world.objects.find(object => object.id === targetId);
  if (!target) return invalid(`unknown object target ${targetId}`);
  return target.collision ?? { x: target.x - target.width / 2, y: target.y - 8, width: target.width, height: 8 };
}
function targetDistance(point: Tile, box: TargetBox): number {
  const x = point.x * 16 + 8, y = point.y * 16 + 15;
  return Math.hypot(Math.max(box.x - x, 0, x - box.x - box.width), Math.max(box.y - y, 0, y - box.y - box.height));
}
function nearby(point: Tile, box: TargetBox): boolean {
  const distance = targetDistance(point, box);
  return distance > 0 && distance <= INTERACTION_LIMITS.reach;
}
function clearReach(scene: DayScene, point: Tile, targetId: string, box: TargetBox): boolean {
  const fromX = point.x * 16 + 8, fromY = point.y * 16 + 15;
  const toX = Math.max(box.x, Math.min(box.x + box.width, fromX));
  const toY = Math.max(box.y, Math.min(box.y + box.height, fromY));
  const obstacles = scene.world!.objects.filter(item => item.id !== targetId && item.collision).map(item => item.collision!);
  if (targetId !== "food" && scene.food) obstacles.push({ x: scene.food.tile.x * 16, y: scene.food.tile.y * 16 + 6, width: 16, height: 10 });
  const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY)));
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * i / steps, y = fromY + (toY - fromY) * i / steps;
    if (obstacles.some(item => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height)) return false;
  }
  return true;
}
function validApproach(scene: DayScene, value: unknown, targetId: string, box: TargetBox, reached: Set<string>): value is Tile {
  return record(value) && keys(value, ["x", "y"]) && integer(value.x, 0, 127) && integer(value.y, 0, 127) &&
    isSceneTileWalkable(scene, value as Tile) && reached.has(`${value.x},${value.y}`) && nearby(value as Tile, box) && clearReach(scene, value as Tile, targetId, box);
}
function validateSteps(steps: unknown, assets: Map<string, InteractionAsset>): asserts steps is InteractionStep[] {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > INTERACTION_LIMITS.steps) invalid("action needs 1–12 steps");
  let duration = 0, words = 0;
  for (const step of steps) {
    if (!record(step) || typeof step.type !== "string") invalid("malformed command");
    switch (step.type) {
      case "face":
        if (!keys(step, ["type", "direction"]) || !["up", "down", "left", "right"].includes(String(step.direction))) invalid("unsupported facing direction");
        break;
      case "wait":
      case "animate": {
        if (!keys(step, step.type === "wait" ? ["type", "durationMs"] : ["type", "durationMs", "assetId"]) || !integer(step.durationMs, 100, INTERACTION_LIMITS.stepMs)) invalid("step duration must be 100–15000 ms");
        duration += step.durationMs;
        if (step.type === "animate" && (typeof step.assetId !== "string" || !["pose", "effect"].includes(assets.get(step.assetId)?.kind ?? ""))) invalid("animation needs an explicitly supplied pose or effect");
        break;
      }
      case "say":
        if (!keys(step, ["type", "text"]) || !text(step.text)) invalid("dialogue is missing or too long");
        words += step.text.length;
        break;
      case "attach":
        if (!keys(step, ["type", "assetId"]) || typeof step.assetId !== "string" || assets.get(step.assetId)?.kind !== "prop") invalid("attachment needs a supplied prop");
        break;
      case "detach":
        if (!keys(step, ["type"])) invalid("detach does not accept object references");
        break;
      case "setObject":
        if (!keys(step, ["type", "state"]) || !["hidden", "default"].includes(String(step.state))) invalid("setObject can only change this action's target");
        break;
      default: invalid(`unsupported command ${step.type}`);
    }
  }
  if (duration > INTERACTION_LIMITS.actionMs || words > 1500) invalid("action exceeds the duration or dialogue limit");
}
function validateConditions(actions: InteractionAction[]): void {
  const byId = new Map(actions.map(action => [action.id, action]));
  for (const action of actions) {
    if (action.requires === undefined) continue;
    if (!record(action.requires) || !keys(action.requires, ["completed", "notCompleted"])) invalid("malformed action conditions");
    for (const refs of [action.requires.completed, action.requires.notCompleted]) {
      if (refs !== undefined && (!Array.isArray(refs) || refs.length > 8 || new Set(refs).size !== refs.length || refs.some(ref => !id(ref) || !byId.has(ref) || ref === action.id))) invalid("conditions must reference other actions in this scene");
    }
    if (action.requires.completed?.some(ref => action.requires!.notCompleted?.includes(ref))) invalid("contradictory action conditions");
  }
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(action: InteractionAction): void {
    if (done.has(action.id)) return;
    if (visiting.has(action.id)) invalid("completed-action conditions contain a cycle");
    visiting.add(action.id);
    for (const ref of action.requires?.completed ?? []) visit(byId.get(ref)!);
    visiting.delete(action.id); done.add(action.id);
  }
  actions.forEach(visit);
}

/** Validate every reference and approach before the runtime executes a fixed-library sequence. */
export function validateInteractionPack(scene: DayScene, value: unknown): asserts value is InteractionPack {
  if (!record(value) || !keys(value, ["version", "catalog", "actions"]) || value.version !== 1) invalid("unsupported pack version");
  validateInteractionCatalog(value.catalog);
  if (!Array.isArray(value.actions) || value.actions.length > INTERACTION_LIMITS.actions || !scene.world) invalid("world scene has too many or malformed actions");
  const assets = new Map(value.catalog.assets.map(asset => [asset.id, asset]));
  const ids = new Set<string>();
  const reached = value.actions.length ? sceneReachableTiles(scene) : new Set<string>();
  for (const action of value.actions) {
    if (!record(action) || !keys(action, ["id", "targetId", "label", "repeatable", "approach", "steps", "requires"]) ||
      !id(action.id) || ids.has(action.id) || !id(action.targetId) || !text(action.label, 80) || typeof action.repeatable !== "boolean") invalid("malformed action");
    const box = targetBox(scene, action.targetId);
    if (!validApproach(scene, action.approach, action.targetId, box, reached)) invalid(`unreachable or distant approach for ${action.id}`);
    validateSteps(action.steps, assets);
    const removable = action.targetId === "food" && Boolean(scene.food) || scene.world.objects.some(object => object.id === action.targetId && object.removable === true);
    if (!removable && action.steps.some(step => step.type === "setObject")) invalid("permanent scenery cannot be hidden or restored by an interaction");
    ids.add(action.id);
  }
  validateConditions(value.actions as InteractionAction[]);
}

/** Unknown planner proposals can select only supplied assets and known commands. No art is invented. */
export function compileInteractionPack(scene: DayScene, proposal: unknown, catalog: InteractionCatalog): InteractionPack {
  validateInteractionCatalog(catalog);
  if (!record(proposal) || !keys(proposal, ["actions"]) || !Array.isArray(proposal.actions) || proposal.actions.length > INTERACTION_LIMITS.actions) invalid("malformed proposal");
  const reached = sceneReachableTiles(scene);
  const actions = proposal.actions.map(raw => {
    if (!record(raw) || !id(raw.targetId)) return invalid("malformed proposed target");
    const action = structuredClone(raw);
    const box = targetBox(scene, raw.targetId);
    if (action.approach === undefined || action.approach === null) {
      let best: Tile | undefined, distance = Infinity;
      for (const key of reached) {
        const [x, y] = key.split(",").map(Number), point = { x, y };
        // The front of a three-quarter-view building keeps the avatar above its art in y-sort.
        // A full reach-radius penalty prefers any valid front position, retaining other sides as a fallback.
        const behindFront = point.y * 16 + 15 < box.y + box.height;
        const score = targetDistance(point, box) + (behindFront ? INTERACTION_LIMITS.reach + 1 : 0);
        if (nearby(point, box) && score < distance && clearReach(scene, point, raw.targetId, box)) { best = point; distance = score; }
      }
      if (!best) return invalid(`no safe approach for ${raw.targetId}`);
      action.approach = best;
    }
    if (action.requires === null) delete action.requires;
    return action;
  });
  const pack = { version: 1 as const, catalog: parseInteractionCatalog(catalog), actions };
  validateInteractionPack(scene, pack);
  return pack;
}
