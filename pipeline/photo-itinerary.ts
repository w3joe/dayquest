import type { JourneyLeg } from "../lib/day";
import type { JourneyConnection } from "../lib/itinerary";

/**
 * Builds a day's places and the travel between them from photo metadata alone, for people who upload no location history.
 * The places are real (photo GPS and time). The travel is a GUESS and is always flagged `estimated`: by default the Tube between
 * the stations nearest each place, with a walking leg when the places share a station or no station is near.
 */
export type PhotoMeta = { id: string; kind: string; /** camera wall-clock, "YYYY-MM-DD HH:MM" */ takenAt?: string; lat?: number; lng?: number };
export type PlaceCluster = { id: string; lat: number; lng: number; time: string; photoIds: string[]; kinds: string[] };
export type Station = { name: string; lat: number; lng: number };
export type JourneyPlanner = (from: Station, to: Station) => Promise<JourneyLeg[] | undefined>;

export const PLACE_RADIUS_M = 250;
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  return 12742000 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2));
};
const clock = (takenAt?: string) => (takenAt && /\d{2}:\d{2}/.test(takenAt) ? takenAt.slice(11, 16) : undefined);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const isPlacePhoto = (m: PhotoMeta) => m.kind !== "fit" && m.kind !== "fit_back";

/**
 * Groups photos taken within PLACE_RADIUS_M of each other into one place, ordered by the earliest time in each.
 * Photos without GPS join the place whose time is nearest; with no GPS anywhere there are no places (the caller builds one world as before).
 */
export function clusterPlaces(photos: PhotoMeta[]): PlaceCluster[] {
  const usable = photos.filter(isPlacePhoto);
  const located = usable.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.id.localeCompare(b.id));
  const groups: { lat: number; lng: number; photos: PhotoMeta[] }[] = [];
  for (const p of located) {
    const home = groups.find((g) => metres(g, { lat: p.lat!, lng: p.lng! }) <= PLACE_RADIUS_M);
    if (home) { home.photos.push(p); home.lat = home.photos.reduce((n, q) => n + q.lat!, 0) / home.photos.length; home.lng = home.photos.reduce((n, q) => n + q.lng!, 0) / home.photos.length; }
    else groups.push({ lat: p.lat!, lng: p.lng!, photos: [p] });
  }
  if (!groups.length) return [];
  const timeOf = (g: (typeof groups)[number]) => g.photos.map((p) => clock(p.takenAt)).filter((t): t is string => !!t).sort()[0] ?? "12:00";
  // Attach photos that have no GPS to the place nearest in time (or the first place when they have no time either).
  for (const p of usable.filter((q) => !located.includes(q))) {
    const t = clock(p.takenAt);
    const target = t ? [...groups].sort((a, b) => Math.abs(minutes(timeOf(a)) - minutes(t)) - Math.abs(minutes(timeOf(b)) - minutes(t)))[0] : groups[0];
    target.photos.push(p);
  }
  return groups.sort((a, b) => timeOf(a).localeCompare(timeOf(b)))
    .map((g, i) => ({ id: `place_${i + 1}`, lat: g.lat, lng: g.lng, time: timeOf(g), photoIds: g.photos.map((p) => p.id), kinds: [...new Set(g.photos.map((p) => p.kind))] }));
}

/** Central London Tube stations, hand-checked to about 50 m. Used when the live planner is unavailable. */
export const CENTRAL_STATIONS: Station[] = [
  { name: "Westminster", lat: 51.5010, lng: -0.1254 }, { name: "St James's Park", lat: 51.4994, lng: -0.1335 }, { name: "Embankment", lat: 51.5074, lng: -0.1223 },
  { name: "Charing Cross", lat: 51.5080, lng: -0.1247 }, { name: "Waterloo", lat: 51.5031, lng: -0.1132 }, { name: "Leicester Square", lat: 51.5113, lng: -0.1281 },
  { name: "Piccadilly Circus", lat: 51.5098, lng: -0.1342 }, { name: "Covent Garden", lat: 51.5129, lng: -0.1243 }, { name: "Tottenham Court Road", lat: 51.5165, lng: -0.1310 },
  { name: "Goodge Street", lat: 51.5205, lng: -0.1347 }, { name: "Oxford Circus", lat: 51.5152, lng: -0.1419 }, { name: "Green Park", lat: 51.5067, lng: -0.1428 },
  { name: "Victoria", lat: 51.4965, lng: -0.1447 }, { name: "Bond Street", lat: 51.5142, lng: -0.1494 }, { name: "Marble Arch", lat: 51.5136, lng: -0.1586 },
  { name: "Holborn", lat: 51.5174, lng: -0.1200 }, { name: "Russell Square", lat: 51.5230, lng: -0.1244 }, { name: "Warren Street", lat: 51.5247, lng: -0.1384 },
  { name: "Euston", lat: 51.5282, lng: -0.1337 }, { name: "King's Cross St Pancras", lat: 51.5308, lng: -0.1238 }, { name: "Regent's Park", lat: 51.5234, lng: -0.1466 },
  { name: "Baker Street", lat: 51.5226, lng: -0.1571 }, { name: "Paddington", lat: 51.5154, lng: -0.1755 }, { name: "Bank", lat: 51.5133, lng: -0.0886 },
  { name: "London Bridge", lat: 51.5052, lng: -0.0864 }, { name: "Southwark", lat: 51.5040, lng: -0.1052 }, { name: "Lambeth North", lat: 51.4991, lng: -0.1115 },
  { name: "Temple", lat: 51.5111, lng: -0.1141 }, { name: "Blackfriars", lat: 51.5121, lng: -0.1031 }, { name: "Chancery Lane", lat: 51.5185, lng: -0.1111 },
];
export function nearestStation(at: { lat: number; lng: number }, stations: Station[] = CENTRAL_STATIONS, maxM = 1400): Station | undefined {
  const best = [...stations].sort((a, b) => metres(at, a) - metres(at, b))[0];
  return best && metres(at, best) <= maxM ? best : undefined;
}

/** TfL line colours (SPEC section 7). */
export const LINE_COLOURS: Record<string, string> = {
  Bakerloo: "#B36305", Central: "#E32017", Circle: "#FFD300", District: "#00782A", "Hammersmith & City": "#F3A9BB", Jubilee: "#A0A5A9",
  Metropolitan: "#9B0056", Northern: "#000000", Piccadilly: "#003688", Victoria: "#0098D4", "Waterloo & City": "#95CDBA", Elizabeth: "#6950A1",
};
const GENERIC_LINE = "#0019A8"; // the roundel blue, for a Tube leg whose line we could not determine
const TUBE_MS = 4000;

type TflLeg = { mode?: { id?: string }; routeOptions?: { name?: string }[]; departurePoint?: { commonName?: string }; arrivalPoint?: { commonName?: string }; path?: { stopPoints?: { name?: string }[] } };
const tidy = (name = "") => name.replace(/\s+(Underground|Rail)?\s*Station$/i, "").replace(/\s+/g, " ").trim();

/** The live planner: TfL's journey planner between two stations, keeping only its Tube legs. Never throws; undefined when it has no answer. */
export function tflPlanner(fetchImpl: typeof fetch = fetch): JourneyPlanner {
  return async (from, to) => {
    try {
      const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from.lat},${from.lng}/to/${to.lat},${to.lng}?mode=tube`;
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
      if (!response.ok) return undefined;
      const legs = ((await response.json()) as { journeys?: { legs?: TflLeg[] }[] }).journeys?.[0]?.legs?.filter((l) => l.mode?.id === "tube") ?? [];
      const out = legs.flatMap((l): JourneyLeg[] => {
        const line = (l.routeOptions?.[0]?.name ?? "").replace(/\s+line$/i, "");
        const stops = l.path?.stopPoints?.map((s) => tidy(s.name)).filter(Boolean) ?? [];
        const a = stops[0] || tidy(l.departurePoint?.commonName), b = stops[stops.length - 1] || tidy(l.arrivalPoint?.commonName);
        return line && a && b && a !== b ? [{ mode: "tube", line, color: LINE_COLOURS[line] ?? GENERIC_LINE, stations: [a, b], durationMs: TUBE_MS, estimated: true }] : [];
      });
      return out.length ? out : undefined;
    } catch { return undefined; }
  };
}

/**
 * One connection between each pair of consecutive places. Always estimated. Tube between the nearest stations (live planner when supplied,
 * otherwise a generic Tube leg); a walk when the places share a station or no station is near either end.
 */
export async function guessConnections(places: PlaceCluster[], options: { stations?: Station[]; planner?: JourneyPlanner } = {}): Promise<JourneyConnection[]> {
  const out: JourneyConnection[] = [];
  for (let i = 0; i + 1 < places.length; i++) {
    const a = places[i], b = places[i + 1];
    const sa = nearestStation(a, options.stations), sb = nearestStation(b, options.stations);
    let legs: JourneyLeg[];
    if (!sa || !sb || sa.name === sb.name) legs = [{ mode: "walk", from: sa?.name ?? `Place ${i + 1}`, to: sb?.name ?? `Place ${i + 2}`, durationMs: TUBE_MS, estimated: true }];
    else legs = (await options.planner?.(sa, sb)) ?? [{ mode: "tube", line: "Underground", color: GENERIC_LINE, stations: [sa.name, sb.name], durationMs: TUBE_MS, estimated: true }];
    out.push({ id: `${a.id}_to_${b.id}`, fromSceneId: a.id, toSceneId: b.id, legs });
  }
  return out;
}
