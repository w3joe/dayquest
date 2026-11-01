import { ISOLATED_OBJECT } from "../lib/art-style";
import type { ImageGenerator, ImageRequest } from "./imagegen";
import { pixelateSceneSprite, pixelateWalkSheet } from "./pixelate";
import type { SceneBlueprint } from "./scene-types";
import type { UploadKind } from "./types";
import { safeOpenAIError } from "../lib/server/openai-errors";
import { RequestError } from "../lib/server/errors";

export type SceneAssetJob = ImageRequest & {
  id: string;
  file: string;
  process(raw: Buffer): Promise<Buffer>;
};

export type SceneAssetSources = {
  uploads: Partial<Record<UploadKind, Buffer>>;
  /** The accepted canonical 32×48 character from the existing fit check. */
  player: Buffer;
  /** Processed Shadwell assets, used for style only, after the subject photo. */
  styleReferences?: Buffer[];
};

export const WALK_SHEET_PROMPT = `${ISOLATED_OBJECT}
Create a CHARACTER WALKING SPRITE SHEET. The single-object instruction applies independently to EACH CELL.
Use exactly THREE equal-width columns and FOUR equal-height rows on the entire canvas: twelve independent frames, no gaps between cells, no labels, no drawn grid lines.
Row 1 faces DOWN toward the viewer. Row 2 faces LEFT. Row 3 faces RIGHT. Row 4 faces UP away from the viewer.
In each row, column 1 is neutral standing, column 2 is walking with the left foot forward, column 3 is walking with the right foot forward.
The first reference is the canonical character: keep their clothing, colours, hairstyle, skin tone, outline weight and body proportions consistent in every frame. Any additional fit photo is for visible clothing details only; do not infer identity.
Each cell contains exactly one complete full-body character including both shoes. Keep the character small enough to leave clear fully transparent margins on ALL four sides of each cell; no limb may cross a cell boundary.
Keep identical character scale, horizontal centre and foot baseline in every cell. Preserve transparency. Do not add scenery, shadows, checkerboards, captions, accessories absent from the reference, or other people.`;

/** Pure job planning makes each completed PNG independently persistable/retryable. */
export function buildSceneAssetJobs(blueprint: SceneBlueprint, sources: SceneAssetSources): SceneAssetJob[] {
  // Capture processors before any paid requests; a hot-reloaded module must not
  // turn a successful image response into an uncallable processing dependency.
  const processSprite = pixelateSceneSprite;
  const processWalk = pixelateWalkSheet;
  if (typeof processSprite !== "function" || typeof processWalk !== "function") {
    throw new RequestError("Sprite processing is reloading. Please retry in a moment.", 503);
  }
  const styles = sources.styleReferences?.slice(0, 2) ?? [];
  const reference = (photo?: Buffer): Buffer[] => photo ? [photo, ...styles] : styles;
  const jobs: SceneAssetJob[] = blueprint.buildings.map((building) => ({
    id: building.id,
    file: `${building.id}.png`,
    kind: "landmark",
    name: building.name,
    prompt: `${ISOLATED_OBJECT} A detailed, recognisable three-quarter top-down building sprite for a walkable neighbourhood, with readable roof, facade, windows and entrance. ${building.description}. ${building.observed ? "Use the FIRST reference photo for the building's observed shape, materials and distinctive details. Extract only this building, not the photograph's background." : "This is a supporting building imagined to match the setting, not a claim about a real named place. Keep it secondary to the main photographed location."} Additional references show the pixel-art style only. Match their perspective and palette. Fit a 160 by 128 game-sprite footprint. No people, text overlays, ground tile or surrounding buildings.`,
    references: reference(sources.uploads.landmark),
    process: (raw) => processSprite(raw, 160, 128),
  }));
  for (const prop of blueprint.props.filter((candidate) => !candidate.library)) {
    jobs.push({
      id: prop.id, file: `${prop.id}.png`, kind: "landmark", name: prop.name,
      prompt: `${ISOLATED_OBJECT} A distinctive small neighbourhood prop: ${prop.description}. Match the FIRST location photo's visible details where present. Additional references supply style only. Three-quarter top-down view, compatible with a 32 by 48 game-sprite footprint. No people or buildings.`,
      references: reference(sources.uploads.landmark),
      process: (raw) => processSprite(raw, 32, 48),
    });
  }
  // Designed characters and interactables come from the committed library; only ones it lacks are generated for this day.
  for (const actor of [...(blueprint.design?.interactables ?? []), ...(blueprint.design?.npcs ?? [])].filter((candidate) => !candidate.library)) {
    jobs.push({
      id: `actor_${actor.id}`, file: `actor_${actor.id}.png`, kind: "landmark", name: actor.name,
      prompt: `${ISOLATED_OBJECT} A small friendly game sprite for a cosy walkable neighbourhood: ${actor.description}. Three-quarter top-down view, clear outline, warm colours, a single character or object only.`,
      references: styles,
      process: (raw) => processSprite(raw, 32, 48),
    });
  }
  if (blueprint.food) {
    jobs.push({
      id: "food", file: "food.png", kind: "food", name: blueprint.food.name,
      prompt: `${ISOLATED_OBJECT} A small appetising food sprite viewed from slightly above: ${blueprint.food.description}. The FIRST reference is the user's lunch; preserve its actual visible ingredients, colours and presentation, simplifying into a readable 32 by 32 pixel-game pickup. Additional references supply style only. No hands, table, packaging text or background.`,
      references: reference(sources.uploads.lunch),
      process: (raw) => processSprite(raw, 32, 32),
    });
  }
  jobs.push({
    id: "player_walk", file: "player_walk.png", kind: "player", name: "Your walking character",
    prompt: WALK_SHEET_PROMPT,
    references: [sources.player, ...(sources.uploads.fit ? [sources.uploads.fit] : [])],
    process: processWalk,
  });
  return jobs;
}

/** No fallback artwork: a failure remains retryable and keeps its actionable cause. */
export async function generateSceneAsset(job: SceneAssetJob, generator: ImageGenerator): Promise<Buffer> {
  try {
    return await job.process(await generator.generate(job));
  } catch (error) {
    throw safeOpenAIError(error);
  }
}
