import type { TransitLeg } from "@/lib/day";
import type { DayInput } from "./types";

/**
 * Tile positions per base map. A owns the maps; these are the §4.2 defaults and the
 * only place to change them. 20×15 tiles; spawn at the bottom so the first move is "up".
 */
export { BASE_LAYOUT } from "@/game/maps";

/** §7 TfL line colours. */
export const TFL_COLOURS: Record<string, string> = {
  Bakerloo: "#B36305", Central: "#E32017", Circle: "#FFD300", District: "#00782A",
  "Hammersmith & City": "#F3A9BB", Jubilee: "#A0A5A9", Metropolitan: "#9B0056", Northern: "#000000",
  Piccadilly: "#003688", Victoria: "#0098D4", "Waterloo & City": "#95CDBA", Elizabeth: "#6950A1",
};

/**
 * input.transport → exactly 2 transitions (scene 1→2, 2→3). Consecutive tube legs are one
 * journey (a change), anything else starts a new one; extra journeys fold into the last.
 */
export function buildTransit(transport: DayInput["transport"]): { legs: TransitLeg[] }[] {
  const journeys: TransitLeg[][] = [];
  for (const t of transport) {
    const leg: TransitLeg = t.mode === "bus"
      ? { mode: "bus", route: t.route, destination: t.destination, from: t.from, to: t.to }
      : { mode: "tube", line: t.line, color: TFL_COLOURS[t.line] ?? "#000000", stations: t.stations };
    const last = journeys.at(-1);
    if (last && leg.mode === "tube" && last.at(-1)?.mode === "tube") last.push(leg);
    else journeys.push([leg]);
  }
  while (journeys.length > 2) journeys[journeys.length - 2].push(...journeys.pop()!);
  const walk: TransitLeg = { mode: "bus", route: "WALK", destination: "On foot", from: "Here", to: "There" };
  while (journeys.length < 2) journeys.push([walk]);
  return journeys.map((legs) => ({ legs }));
}
