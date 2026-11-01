export type LocationPoint = { lat: number; lng: number; t?: number };

const MAX_BYTES = 25 * 1024 * 1024;

function geo(value: unknown): { lat: number; lng: number } | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)°?/);
  return match ? { lat: Number(match[1]), lng: Number(match[2]) } : undefined;
}
const time = (value: unknown) => {
  const t = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : undefined;
};
const valid = (p?: { lat: number; lng: number }): p is { lat: number; lng: number } => !!p && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

function fromGpx(text: string): LocationPoint[] {
  const points: LocationPoint[] = [];
  for (const match of text.matchAll(/<(?:trkpt|wpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|wpt|rtept)>|<(?:trkpt|wpt|rtept)\b([^>]*)\/>/g)) {
    const attrs = match[1] ?? match[3] ?? "";
    const lat = Number(attrs.match(/\blat="(-?[\d.]+)"/)?.[1]), lng = Number(attrs.match(/\blon="(-?[\d.]+)"/)?.[1]);
    const t = time(match[2]?.match(/<time>([^<]+)<\/time>/)?.[1]);
    if (valid({ lat, lng })) points.push({ lat, lng, ...(t === undefined ? {} : { t }) });
  }
  return points;
}

function fromJson(data: unknown): LocationPoint[] {
  const points: LocationPoint[] = [];
  const add = (p: { lat: number; lng: number } | undefined, t?: number) => { if (valid(p)) points.push({ ...p, ...(t === undefined ? {} : { t }) }); };
  const records = Array.isArray(data) ? data : [];
  const rec = (data ?? {}) as Record<string, unknown>;
  // Classic Takeout: { locations: [{ latitudeE7, longitudeE7, timestamp }] }
  if (Array.isArray(rec.locations)) for (const l of rec.locations as Record<string, unknown>[]) {
    if (typeof l.latitudeE7 === "number" && typeof l.longitudeE7 === "number") add({ lat: l.latitudeE7 / 1e7, lng: l.longitudeE7 / 1e7 }, time(l.timestamp ?? l.timestampMs));
  }
  // Timeline export: segments (or a bare array) of visits, activities and timeline paths.
  const segments = Array.isArray(rec.semanticSegments) ? rec.semanticSegments : records;
  for (const seg of segments as Record<string, any>[]) {
    const start = time(seg?.startTime);
    for (const p of seg?.timelinePath ?? []) add(geo(p?.point), time(p?.time) ?? start);
    add(geo(seg?.visit?.topCandidate?.placeLocation?.latLng ?? seg?.visit?.topCandidate?.placeLocation), start);
    add(geo(seg?.activity?.start?.latLng ?? seg?.activity?.start), start);
    add(geo(seg?.activity?.end?.latLng ?? seg?.activity?.end), time(seg?.endTime));
  }
  return points;
}

/** Best-effort parse of a Google Takeout JSON or GPX location history. Throws a friendly error if nothing usable is found. */
export function parseLocationHistory(text: string, filename = ""): LocationPoint[] {
  if (text.length > MAX_BYTES) throw new Error("That file is too large. Export a shorter range.");
  const trimmed = text.trimStart();
  let points: LocationPoint[];
  try {
    points = trimmed.startsWith("<") || /\.gpx$/i.test(filename) ? fromGpx(text) : fromJson(JSON.parse(text));
  } catch { throw new Error("We couldn’t read that file. Try a Google Timeline JSON or a GPX file."); }
  if (!points.length) throw new Error("No locations found in that file.");
  return points;
}

export const MAX_LOCATION_FILE_BYTES = MAX_BYTES;
