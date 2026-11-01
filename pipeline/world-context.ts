import { ACTOR_LIBRARY, type Ground, type LibraryActor } from "../lib/actor-library";
import { WORLD_ZONES, buildingAnchors } from "../game/world-layout";
import type { SceneBlueprint } from "./scene-types";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = { condition: "clear" | "cloudy" | "rain" | "drizzle" | "snow" | "fog" | "storm"; tempC?: number };
/** Optional, from an uploaded location history. Everything here is the user's own data; nothing is looked up or invented. */
export type LocationContext = {
  stops: { time: string; label: string; kind?: "meal" | "park" | "tourist" | "other"; dwellMin?: number }[];
  transit: { mode: "bus" | "tube"; summary: string }[];
  workouts: { time: string; type: string; distanceKm: number; durationMin: number; steps?: number }[];
};
export type Environment = { season?: Season; weather?: Weather; location?: LocationContext; notes?: string };

export type WorldContext = {
  user: { name: string; date: string; notes?: string };
  scene: { title: string; locationName: string; description: string; time: string; partOfDay: "morning" | "midday" | "afternoon" | "evening" | "night"; ground: Ground; groundedInPhotos: boolean };
  buildings: { id: string; name: string; description: string; seenInPhoto: boolean; x: number; y: number }[];
  props: { id: string; name: string; description: string }[];
  food?: { name: string; description: string; text: string };
  layout: { widthPx: number; heightPx: number; zones: { id: string; label: string; use: string }[] };
  environment: { season: Season; weather?: Weather };
  location?: LocationContext;
  library: Pick<LibraryActor, "id" | "name" | "role" | "hint" | "effects">[];
  /** Building ids and zone ids a design may use as `near`. */
  anchors: string[];
  /** How the world works. Models must obey these; the inspector enforces the physical ones in code. */
  physics: string[];
  rules: string[];
};

/** Northern-hemisphere default; pass a negative latitude for the south. */
export function seasonOf(date: string, latitude = 51): Season {
  const month = Number(date.slice(5, 7));
  const north: Season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  if (latitude >= 0) return north;
  return ({ spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" } as const)[north];
}
export function partOfDay(time: string): WorldContext["scene"]["partOfDay"] {
  const h = Number(time.slice(0, 2));
  return h < 11 ? "morning" : h < 14 ? "midday" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

/** Sprites that make no sense in this season are not offered, so a summer day never gets a snowman. */
const SEASONAL: Record<string, Season[]> = { snowman: ["winter"], leaf_pile: ["autumn"], swan: ["spring", "summer", "autumn", "winter"], jogger: ["spring", "summer", "autumn", "winter"] };

export function buildWorldContext(blueprint: SceneBlueprint, input: { name: string; date: string }, env: Environment = {}): WorldContext {
  const season = env.season ?? seasonOf(input.date);
  const anchors = buildingAnchors(blueprint);
  const library = ACTOR_LIBRARY.filter((a) => a.grounds.includes(blueprint.ground) && (SEASONAL[a.id]?.includes(season) ?? true))
    .map(({ id, name, role, hint, effects }) => ({ id, name, role, hint, effects }));
  return {
    user: { name: input.name, date: input.date, notes: env.notes },
    scene: { title: blueprint.title, locationName: blueprint.locationName, description: blueprint.description, time: blueprint.time, partOfDay: partOfDay(blueprint.time),
      ground: blueprint.ground, groundedInPhotos: blueprint.source === "photo" },
    buildings: blueprint.buildings.slice(0, 3).map((b, i) => ({ id: b.id, name: b.name, description: b.description, seenInPhoto: b.observed, x: anchors[i].x, y: anchors[i].y })),
    props: blueprint.props.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    food: blueprint.food,
    layout: { widthPx: 640, heightPx: 448, zones: WORLD_ZONES.map(({ id, label, use }) => ({ id, label, use })) },
    environment: { season, weather: env.weather },
    location: env.location,
    library,
    anchors: [...anchors.map((a) => a.id), ...WORLD_ZONES.map((z) => z.id)],
    physics: [
      "People and animals stand on pavement, cobbles or grass. Never on the road, the kerb strip, or water.",
      "Animals suit the place: swans and ducks only on a park scene, squirrels near trees and lawns, pigeons on pavement near people, cats and dogs near people or buildings.",
      "A bench is for sitting; a bird feeder is for feeding; a pile of leaves is for shaking and only in autumn; a lantern is for lighting, most welcome in the evening, dusk or gloom; a bell rings; a crossing button belongs at the crossing.",
      "Every thing needs clear space around it so the player can walk past, and nothing may block the route from the start to the exit.",
      "A character who wanders only wanders a little (0 to 24 px) and only along open ground.",
      "Weather and season change what is sensible: no sunbathing or picnics in rain, no snowman outside winter, no kite in a storm.",
    ],
    rules: [
      "Only use facts present in this context. Never invent a named business, person, event or travel route.",
      "Every line is warm, kind and short. No jokes at anyone's expense, no links, no contact details, no all-capitals.",
      "Exactly 3 interactables with at least 2 different effects, and 1 to 3 NPCs.",
      "Prefer a library sprite (use its id). Only give `library: null` with a clear description when nothing in the library fits.",
      "Set `near` to a building id or a zone id so each thing sits where it makes sense, for example a bell by the cafe or a bench on a verge.",
      "Respect the season and weather in what appears and in what is said (no snowman outside winter, no sunbathing in rain).",
    ],
  };
}
