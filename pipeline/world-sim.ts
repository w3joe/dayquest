import type { DayScene, Tile } from "../lib/day";
import { buildingAnchors, buildWorldLayout } from "../game/world-layout";
import type { SceneBlueprint } from "./scene-types";
import type { Composition } from "../game/composition";
import type { WorldDesign } from "./world-design";

export type SimulatedWorld = { world: NonNullable<DayScene["world"]>; spawn: Tile; exit: Tile; buildings: ReturnType<typeof buildingAnchors> };

/**
 * Builds the final layout for a design before any sprite exists. Layout depends only on ids, sizes and the deterministic placement code,
 * so reviewers (the inspector and the tuner) can see exactly what will be delivered, ahead of paying for the images.
 */
export function simulateWorld(blueprint: SceneBlueprint, design: WorldDesign, composition?: Composition): SimulatedWorld {
  const withDesign = { ...blueprint, design, ...(composition ? { composition } : {}) };
  const sprites: Record<string, string> = {};
  for (const item of [...blueprint.buildings, ...blueprint.props, ...design.interactables, ...design.npcs]) sprites[item.id] = "simulated.png";
  for (const item of [...design.interactables, ...design.npcs]) sprites[`actor_${item.id}`] = "simulated.png";
  const layout = buildWorldLayout(withDesign, sprites);
  return { world: layout.world, spawn: layout.spawn, exit: layout.exit, buildings: buildingAnchors(withDesign) };
}
