import { fetchJson } from "./http";
import { haversineM } from "./time";
import type { HighlightKind, Lookups, NearbyLandmark, PlaceInfo, Stop, TransportLeg } from "./types";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

type Tags = Record<string, string>;
export function classifyTags(t: Tags): PlaceInfo["kind"] {
  if (/^(restaurant|cafe|fast_food|food_court|pub|bar|ice_cream)$/.test(t.amenity ?? "")) return "meal";
  if (/^(park|garden|nature_reserve|common|playground)$/.test(t.leisure ?? "") || t.landuse === "recreation_ground") return "park";
  if (t.tourism && /^(attraction|museum|gallery|viewpoint|artwork|zoo|theme_park)$/.test(t.tourism)) return "tourist";
  if (t.historic || t.man_made === "tower" || t.building === "cathedral" || t.amenity === "place_of_worship") return "tourist";
  return "other";
}

function pick(elements: { tags?: Tags; lat?: number; lon?: number; center?: { lat: number; lon: number } }[], lat: number, lng: number): PlaceInfo | undefined {
  const ranked = elements.filter((e) => e.tags?.name).map((e) => {
    const c = e.center ?? { lat: e.lat ?? lat, lon: e.lon ?? lng };
    return { tags: e.tags!, d: haversineM({ lat, lng }, { lat: c.lat, lng: c.lon }), kind: classifyTags(e.tags!) };
  }).filter((e) => e.kind !== "other").sort((a, b) => a.d - b.d);
  const best = ranked[0];
  return best && { name: best.tags.name, kind: best.kind, detail: best.tags.cuisine?.replace(/;/g, ", ").replace(/_/g, " ") };
}

/** OSM place at a point: Overpass (two mirrors, with backoff) first, then Nominatim reverse as a fallback. */
async function osmPlace(lat: number, lng: number): Promise<PlaceInfo | undefined> {
  const q = `[out:json][timeout:15];(nwr(around:70,${lat},${lng})["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|place_of_worship"]["name"];nwr(around:150,${lat},${lng})["leisure"~"park|garden|nature_reserve|common"]["name"];nwr(around:120,${lat},${lng})["tourism"~"attraction|museum|gallery|viewpoint|zoo"]["name"];nwr(around:120,${lat},${lng})["historic"]["name"];);out center 40;`;
  for (const endpoint of OVERPASS) {
    try {
      const data = await fetchJson<{ elements: Parameters<typeof pick>[0] }>(endpoint, { method: "POST", body: new URLSearchParams({ data: q }), headers: { "content-type": "application/x-www-form-urlencoded" }, retries: 1, timeoutMs: 20000 });
      const found = pick(data.elements, lat, lng);
      if (found) return found;
      return undefined;
    } catch { /* try the next mirror */ }
  }
  try {
    const r = await fetchJson<{ name?: string; category?: string; type?: string; extratags?: Tags }>(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=18&format=jsonv2&extratags=1`);
    const kind = classifyTags({ [r.category ?? ""]: r.type ?? "", ...(r.extratags ?? {}) });
    return r.name && kind !== "other" ? { name: r.name, kind, detail: r.extratags?.cuisine } : undefined;
  } catch { return undefined; }
}

async function osmLabel(lat: number, lng: number): Promise<string | undefined> {
  try {
    const r = await fetchJson<{ name?: string; display_name?: string; address?: Record<string, string> }>(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=18&format=jsonv2`);
    return r.name || [r.address?.road, r.address?.suburb].filter(Boolean).join(", ") || r.display_name?.split(",")[0];
  } catch { return undefined; }
}

async function wikipediaLandmarks(lat: number, lng: number): Promise<NearbyLandmark[]> {
  try {
    const geo = await fetchJson<{ query: { geosearch: { title: string; lat: number; lon: number; dist: number }[] } }>(
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=400&gslimit=12&format=json&origin=*`);
    const skip = /station|street|road|bridge street|house|square$/i; // transport nodes and generic streets rarely read as a pixel landmark
    const rows = geo.query.geosearch.filter((g) => !/tube station|railway station/i.test(g.title)).slice(0, 8);
    const out = await Promise.all(rows.map(async (g): Promise<NearbyLandmark> => {
      try {
        const s = await fetchJson<{ extract?: string; originalimage?: { source: string }; thumbnail?: { source: string } }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(g.title.replace(/ /g, "_"))}`);
        return { title: g.title, lat: g.lat, lng: g.lon, distanceM: Math.round(g.dist), summary: s.extract?.split(". ")[0], image: s.originalimage?.source ?? s.thumbnail?.source };
      } catch { return { title: g.title, lat: g.lat, lng: g.lon, distanceM: Math.round(g.dist) }; }
    }));
    // Prefer ones that have a reference photo and don't look like generic transport/street pages.
    return out.sort((a, b) => Number(!!b.image) - Number(!!a.image) || Number(skip.test(a.title)) - Number(skip.test(b.title)) || a.distanceM - b.distanceM);
  } catch { return []; }
}

const TFL = "https://api.tfl.gov.uk";
type TflLeg = { mode: { id: string }; routeOptions: { name: string; directions: string[] }[]; departurePoint: { commonName: string }; arrivalPoint: { commonName: string }; path?: { stopPoints?: { name: string }[] } };
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s*(Underground|Rail|DLR)? Station$/i, "").replace(/ Stn$/i, "").trim();

/**
 * TfL's journey planner picks *a* sensible route between the two Timeline points. Google's Timeline records only the mode, so the
 * route number/line is a best guess (marked `routeSource: "tfl"`) and can be overridden with hints.
 */
async function tflTransit(from: Stop, to: Stop, mode: "bus" | "tube", whenIso: string): Promise<TransportLeg[] | undefined> {
  const when = new Date(whenIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}`, time = `${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}`;
  try {
    const r = await fetchJson<{ journeys?: { legs: TflLeg[] }[] }>(`${TFL}/Journey/JourneyResults/${from.lat},${from.lng}/to/${to.lat},${to.lng}?mode=${mode === "bus" ? "bus" : "tube"}&date=${date}&time=${time}&timeIs=Departing`);
    const legs = r.journeys?.[0]?.legs.filter((l) => l.mode.id === (mode === "bus" ? "bus" : "tube")) ?? [];
    return legs.map((l): TransportLeg => mode === "bus"
      ? { mode: "bus", route: l.routeOptions[0].name, destination: l.routeOptions[0].directions[0] || undefined, from: clean(l.departurePoint.commonName), to: clean(l.arrivalPoint.commonName), routeSource: "tfl" }
      : { mode: "tube", line: l.routeOptions[0].name.replace(/ line$/i, ""), from: clean(l.departurePoint.commonName), to: clean(l.arrivalPoint.commonName),
          stations: l.path?.stopPoints?.length ? [clean(l.path.stopPoints[0].name), clean(l.path.stopPoints[l.path.stopPoints.length - 1].name)] : [clean(l.departurePoint.commonName), clean(l.arrivalPoint.commonName)] });
  } catch { return undefined; }
}

export const liveLookups: Lookups = { label: osmLabel, place: osmPlace, landmarks: wikipediaLandmarks, transit: tflTransit };
export type { HighlightKind };
