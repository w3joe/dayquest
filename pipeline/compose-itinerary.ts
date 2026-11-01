import { isDayId, parseDayManifest, resolveDayAsset, type DayManifest, type DayScene } from "../lib/day";
import { attachJourneys, type JourneyConnection } from "../lib/itinerary";

/** Turn one independently published location into an itinerary scene.
 * Generated PNGs stay with their original manifest; shared app art keeps its /tiles path.
 * No asset downloads, image calls, geometry changes or location inference occur here.
 */
export function importWorldScene(sourceDay: DayManifest, manifestUrl: string, sceneId: string, index = 0): DayScene {
  parseDayManifest(sourceDay, sourceDay.id);
  if (!isDayId(sceneId)) throw new Error("Supply a stable scene ID.");
  const scene = sourceDay.scenes[index];
  if (!scene?.world) throw new Error("This location has no completed world scene.");
  const resolve = (asset: string) => resolveDayAsset(asset, manifestUrl);
  return {
    ...scene, id: sceneId, spawn: { ...scene.spawn }, exit: { ...scene.exit },
    ...(scene.skyline ? { skyline: resolve(scene.skyline) } : {}),
    landmarks: scene.landmarks.map(landmark => ({ ...landmark, sprite: resolve(landmark.sprite) })),
    world: { ...scene.world, ground: [...scene.world.ground], objects: scene.world.objects.map(object => ({
      ...object, sprite: resolve(object.sprite), ...(object.collision ? { collision: { ...object.collision } } : {}),
    })) },
    ...(scene.food ? { food: { ...scene.food, tile: { ...scene.food.tile }, sprite: resolve(scene.food.sprite),
      ...(scene.food.icon ? { icon: resolve(scene.food.icon) } : {}) } } : {}),
  };
}

/** Select one accepted character for the entire itinerary, preserving its asset origin. */
export function importWorldPlayer(sourceDay: DayManifest, manifestUrl: string): DayManifest["player"] {
  parseDayManifest(sourceDay, sourceDay.id);
  return { ...sourceDay.player, sprite: resolveDayAsset(sourceDay.player.sprite, manifestUrl),
    ...(sourceDay.player.walkSheet ? { walkSheet: resolveDayAsset(sourceDay.player.walkSheet, manifestUrl) } : {}) };
}

export type ItineraryInput = {
  id: string;
  date: string;
  player: DayManifest["player"];
  scenes: DayScene[];
  connections: JourneyConnection[];
};

/** Integration boundary for the locations implementer: completed worlds + explicit travel. */
export function composeWorldItinerary(input: ItineraryInput): DayManifest {
  const connected = attachJourneys(input.scenes, input.connections);
  const manifest: DayManifest = { id: input.id, date: input.date, player: { ...input.player }, ...connected };
  return parseDayManifest(manifest, input.id);
}
