import { haversineM } from "./time";

export type Visit = { start: string; end: string; lat: number; lng: number; name?: string; semanticType?: string };
export type Movement = { start: string; end: string; from: { lat: number; lng: number }; to: { lat: number; lng: number }; type: string; distanceM: number };
export type ParsedTimeline = { visits: Visit[]; movements: Movement[] };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const latLng = (value: unknown): { lat: number; lng: number } | undefined => {
  if (typeof value !== "string") return undefined;
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : undefined;
};
const e7 = (o?: Json) => (o && typeof o.latitudeE7 === "number" && typeof o.longitudeE7 === "number" ? { lat: o.latitudeE7 / 1e7, lng: o.longitudeE7 / 1e7 } : undefined);

function fromSegments(segments: Json[]): ParsedTimeline {
  const out: ParsedTimeline = { visits: [], movements: [] };
  for (const s of segments) {
    if (!s.startTime || !s.endTime) continue;
    if (s.visit) {
      const c = s.visit.topCandidate ?? {};
      const p = latLng(c.placeLocation?.latLng);
      if (p) out.visits.push({ start: s.startTime, end: s.endTime, ...p, name: c.name, semanticType: c.semanticType });
    } else if (s.activity) {
      const from = latLng(s.activity.start?.latLng), to = latLng(s.activity.end?.latLng);
      if (from && to) out.movements.push({ start: s.startTime, end: s.endTime, from, to, type: String(s.activity.topCandidate?.type ?? "UNKNOWN").toUpperCase(), distanceM: Number(s.activity.distanceMeters) || haversineM(from, to) });
    }
  }
  return out;
}

function fromLegacy(objects: Json[]): ParsedTimeline {
  const out: ParsedTimeline = { visits: [], movements: [] };
  for (const o of objects) {
    const v = o.placeVisit, a = o.activitySegment;
    if (v) {
      const p = e7(v.location);
      if (p && v.duration) out.visits.push({ start: v.duration.startTimestamp, end: v.duration.endTimestamp, ...p, name: v.location.name, semanticType: v.location.semanticType });
    } else if (a) {
      const from = e7(a.startLocation), to = e7(a.endLocation);
      if (from && to && a.duration) out.movements.push({ start: a.duration.startTimestamp, end: a.duration.endTimestamp, from, to, type: String(a.activityType ?? "UNKNOWN").toUpperCase(), distanceM: Number(a.distance) || haversineM(from, to) });
    }
  }
  return out;
}

/** Accepts the on-device export ({semanticSegments} or a bare array) and Takeout's legacy {timelineObjects}. */
export function parseTimeline(text: string): ParsedTimeline {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("Timeline file is not valid JSON."); }
  const root = data as Json;
  const parsed = Array.isArray(data) ? fromSegments(data) : Array.isArray(root.semanticSegments) ? fromSegments(root.semanticSegments)
    : Array.isArray(root.timelineObjects) ? fromLegacy(root.timelineObjects) : undefined;
  if (!parsed) throw new Error("Unrecognised Timeline format. Expected semanticSegments, timelineObjects or a segment array.");
  if (!parsed.visits.length && !parsed.movements.length) throw new Error("The Timeline file contains no visits or activities.");
  return parsed;
}

/** Timeline activity types we draw as transit. Everything else (walking, driving, ...) is left out of the transit animation. */
export function transitMode(type: string): "bus" | "tube" | undefined {
  if (type === "IN_BUS") return "bus";
  if (["IN_SUBWAY", "IN_TRAIN", "IN_TRAM", "IN_METRO"].includes(type)) return "tube";
  return undefined;
}
