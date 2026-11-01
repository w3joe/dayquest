import type { DayScene } from "./day";
import { parseInteractionCatalog, type InteractionCatalog } from "./interactions";

/** The shared live library supplies generic effects; photo subjects remain scene-owned. */
export function parseSharedInteractionCatalog(value: unknown): InteractionCatalog {
  const catalog = parseInteractionCatalog(value);
  if (catalog.assets.some(asset => asset.kind !== "effect")) {
    throw new Error("The shared production interaction catalogue may contain only generic effects. Characters, meals and photo objects must use their dynamically generated scene assets.");
  }
  return catalog;
}

/** Called only after the photo-world worker has saved its processed 32×32 food.png. */
export function photoWorldInteractionCatalog(scene: DayScene, shared: InteractionCatalog): InteractionCatalog {
  const catalog = parseSharedInteractionCatalog(shared);
  if (!scene.world || !scene.food) return catalog;
  if (scene.food.sprite !== "food.png") throw new Error("Photo-world pickup must reference the generated food.png.");
  return parseInteractionCatalog({ version: 1, assets: [...catalog.assets, {
    id: "generated_food", src: scene.food.sprite, kind: "prop", width: 32, height: 32,
    anchor: { x: 16, y: 16 },
    description: `This scene's own food sprite, generated from the user's lunch photograph: ${scene.food.name ?? "their lunch"}. ${scene.food.description ?? ""} Carry this exact meal; never substitute a fixed or demo food sprite.`.slice(0, 500),
    tags: ["scene-owned", "photo-generated", "food", "held"],
  }] });
}
