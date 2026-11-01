import {
  isDayId, journeyPointKind, parseDayManifest, sceneCanStep, sceneReachableTiles, validateJourneys,
  type DayScene, type Journey, type JourneyLeg, type Tile, type TravelPoint,
} from "./day";

/** Explicit IDs and route data supplied by the locations integration, never inferred from photos. */
export type JourneyConnection = {
  id?: string;
  fromSceneId: string;
  toSceneId: string;
  legs: JourneyLeg[];
  departure?: TravelPoint;
  arrival?: TravelPoint;
};

function endOf(leg: JourneyLeg, end: boolean): string {
  return leg.mode === "tube" ? leg.stations[end ? leg.stations.length - 1 : 0] : end ? leg.to : leg.from;
}
function automaticPoint(scene: DayScene, leg: JourneyLeg, arrival: boolean): TravelPoint {
  if (scene.world?.width !== 40 || scene.world.height !== 28) throw new Error("Supply explicit travel points for worlds other than 40×28 tiles");
  const target = { x: arrival ? 5 : 34, y: 12 }, targetApproach = { x: arrival ? 6 : 33, y: 12 };
  const reached = sceneReachableTiles(scene);
  let best: { tile: Tile; approach: Tile; score: number } | undefined;
  const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  for (const key of reached) {
    const [x, y] = key.split(",").map(Number), tile = { x, y };
    for (const [dx, dy] of [[arrival ? 1 : -1, 0], [0, -1], [0, 1], [arrival ? -1 : 1, 0]]) {
      const approach = { x: x + dx, y: y + dy };
      if (!reached.has(`${approach.x},${approach.y}`) || !sceneCanStep(scene, tile, approach)) continue;
      const score = distance(tile, target) * 4 + distance(approach, targetApproach);
      if (!best || score < best.score) best = { tile, approach, score };
    }
  }
  if (!best) throw new Error(`No reachable travel point in scene ${scene.id ?? scene.title}`);
  return { kind: journeyPointKind(leg), label: endOf(leg, arrival), tile: best.tile, approach: best.approach };
}
function clonePoint(point: TravelPoint): TravelPoint {
  return { ...point, tile: { ...point.tile }, approach: { ...point.approach } };
}

/** Attach transport to an ordered list of completed worlds, preserving all location geometry.
 * Connections may arrive in any order; returned journeys follow the scenes' exact adjacent order.
 */
export function attachJourneys(scenes: DayScene[], connections: JourneyConnection[]): { scenes: DayScene[]; journeys: Journey[]; transit: [] } {
  if (scenes.length < 1 || scenes.length > 12 || connections.length !== scenes.length - 1) throw new Error("Supply one connection between each adjacent scene (1–12 worlds)");
  const ids = new Set<string>();
  for (const scene of scenes) {
    if (!scene.world || (scenes.length > 1 && (!scene.id || !isDayId(scene.id) || ids.has(scene.id)))) throw new Error("Multi-scene worlds need unique explicit scene IDs");
    if (scene.id) ids.add(scene.id);
    parseDayManifest({ id: "scene_check", date: "2000-01-01", player: { name: "You", sprite: "player.png" }, scenes: [scene], transit: [] }, "scene_check");
  }
  const unused = new Set(connections);
  const journeys: Journey[] = scenes.slice(0, -1).map((scene, index) => {
    const to = scenes[index + 1];
    const matches = connections.filter(connection => connection.fromSceneId === scene.id && connection.toSceneId === to.id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate adjacent connection ${scene.id} → ${to.id}`);
    const connection = matches[0]; unused.delete(connection);
    if (!Array.isArray(connection.legs) || !connection.legs.length) throw new Error("Every journey needs at least one route leg");
    const legs = connection.legs.map(leg => leg.mode === "tube" ? { ...leg, stations: [...leg.stations] } : { ...leg });
    return {
      id: connection.id ?? `journey_${index + 1}`, fromSceneId: scene.id!, toSceneId: to.id!, legs,
      departure: connection.departure ? clonePoint(connection.departure) : automaticPoint(scene, legs[0], false),
      arrival: connection.arrival ? clonePoint(connection.arrival) : automaticPoint(to, legs[legs.length - 1], true),
    };
  });
  if (unused.size) throw new Error("Connections must link adjacent scenes in the supplied order");
  const result = { scenes: scenes.map(scene => ({ ...scene })), journeys, transit: [] as [] };
  validateJourneys(result.scenes, result.journeys);
  return result;
}
