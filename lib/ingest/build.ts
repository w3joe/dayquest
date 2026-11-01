import { parseGpx, type GpxTrack } from "./gpx";
import { parseHealth, type HealthWorkout } from "./health";
import type { PhotoMeta } from "./photos";
import { parseTimeline, transitMode, type ParsedTimeline } from "./timeline";
import { DEFAULT_TZ, haversineM, hhmmToMin, localParts, minutesBetween } from "./time";
import type { Candidate, DayInput, HighlightKind, IngestResult, Lookups, PhotoRef, Stop, TransportLeg, Workout } from "./types";

export type IngestFiles = { timeline?: string; health?: string; gpx?: string; photos?: PhotoMeta[] };
export type IngestOptions = { date?: string; tz?: string; userName?: string; notes?: string; lookups: Lookups };

const MIN_VISIT_MIN = 5;
const SAME_PLACE_M = 120;
const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, m = SAME_PLACE_M) => haversineM(a, b) <= m;

/** Parse every supplied source, then assemble one day in the data/input.json shape plus highlight candidates. */
export async function ingest(files: IngestFiles, options: IngestOptions): Promise<IngestResult> {
  const warnings: string[] = [];
  if (!files.timeline) throw new Error("A Google Timeline export is required: it provides the places and transit for the day.");
  const timeline = parseTimeline(files.timeline);
  let health: HealthWorkout[] = [];
  let gpx: GpxTrack[] = [];
  if (files.health) try { health = parseHealth(files.health); } catch (e) { warnings.push((e as Error).message); }
  if (files.gpx) try { gpx = parseGpx(files.gpx); } catch (e) { warnings.push((e as Error).message); }
  return assemble({ timeline, health, gpx, photos: files.photos ?? [] }, options, warnings);
}

export async function assemble(src: { timeline: ParsedTimeline; health: HealthWorkout[]; gpx: GpxTrack[]; photos: PhotoMeta[] }, options: IngestOptions, warnings: string[] = []): Promise<IngestResult> {
  const tz = options.tz ?? DEFAULT_TZ;
  const { lookups } = options;

  const dateOf = (iso: string) => localParts(iso, tz).date;
  const counts = new Map<string, number>();
  for (const v of src.timeline.visits) counts.set(dateOf(v.start), (counts.get(dateOf(v.start)) ?? 0) + 1);
  const date = options.date ?? [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  if (!date) throw new Error("No dated visits found in the Timeline file.");

  // 1. Stops from visits (short pass-throughs dropped).
  const visits = src.timeline.visits.filter((v) => dateOf(v.start) === date && minutesBetween(v.start, v.end) >= MIN_VISIT_MIN).sort((a, b) => a.start.localeCompare(b.start));
  if (!visits.length) throw new Error(`No visits of at least ${MIN_VISIT_MIN} minutes on ${date}.`);
  type Internal = Stop & { startIso: string };
  const stops: Internal[] = [];
  const placeFor = new Map(await Promise.all(visits.map(async (v) => [v, v.name ? undefined : await lookups.place(v.lat, v.lng)] as const)));
  for (const v of visits) {
    const label = v.name ?? placeFor.get(v)?.name ?? (await lookups.label(v.lat, v.lng)) ?? `Stop at ${localParts(v.start, tz).time}`;
    stops.push({ t: localParts(v.start, tz).time, lat: v.lat, lng: v.lng, label, dwellMin: minutesBetween(v.start, v.end), source: "timeline", startIso: v.start });
  }

  // 2. Transit movements → legs, plus the arrival point as a stop when no visit covers it (stations).
  const transport: TransportLeg[] = [];
  const movements = src.timeline.movements.filter((m) => dateOf(m.start) === date && transitMode(m.type)).sort((a, b) => a.start.localeCompare(b.start));
  const nameAt = async (p: { lat: number; lng: number }) => stops.find((s) => near(s, p))?.label ?? (await lookups.label(p.lat, p.lng)) ?? "Unknown stop";
  for (const m of movements) {
    const mode = transitMode(m.type)!;
    const fromStop: Stop = { t: localParts(m.start, tz).time, ...m.from, label: await nameAt(m.from) };
    const toStop: Stop = { t: localParts(m.end, tz).time, ...m.to, label: await nameAt(m.to) };
    let legs = await lookups.transit(fromStop, toStop, mode, m.start);
    if (!legs?.length) {
      warnings.push(`Could not identify the ${mode === "bus" ? "bus route" : "tube line"} for ${fromStop.label} → ${toStop.label}; showing a generic ${mode} animation.`);
      legs = [mode === "bus" ? { mode: "bus", from: fromStop.label, to: toStop.label, route: "BUS" } : { mode: "tube", line: "Underground", from: fromStop.label, to: toStop.label, stations: [fromStop.label, toStop.label] }];
    }
    transport.push(...legs);
    for (const [p, s] of [[m.from, fromStop], [m.to, toStop]] as const) {
      if (!stops.some((x) => near(x, p) && Math.abs(minutesBetween(x.startIso, p === m.from ? m.start : m.end)) <= 30)) stops.push({ ...s, dwellMin: 0, source: "timeline", startIso: p === m.from ? m.start : m.end });
    }
  }
  stops.sort((a, b) => a.startIso.localeCompare(b.startIso));

  // 3. Workouts: Health is authoritative for stats, GPX supplies the route (and stats if Health has nothing).
  const workouts: Workout[] = [];
  for (const w of src.health) {
    if (dateOf(w.start) !== date) continue;
    workouts.push({ t: localParts(w.start, tz).time, type: w.type, distanceKm: w.distanceKm ?? 0, durationMin: w.durationMin, steps: w.steps, source: "health" });
  }
  for (const g of src.gpx) {
    if (dateOf(g.start) !== date) continue;
    const t = localParts(g.start, tz).time;
    const match = workouts.find((w) => Math.abs(hhmmToMin(w.t) - hhmmToMin(t)) <= 20);
    const route = g.points.filter((_, i) => i % Math.max(1, Math.floor(g.points.length / 60)) === 0);
    if (match) match.route = route;
    else workouts.push({ t, type: g.type ?? "walk", distanceKm: g.distanceKm, durationMin: g.durationMin, source: "gpx", route });
  }
  workouts.sort((a, b) => a.t.localeCompare(b.t));
  if (src.health.length && !workouts.some((w) => w.source === "health")) warnings.push(`Apple Health has no workouts on ${date}.`);

  // 4. Photos: place each at the nearest stop by GPS, else by time.
  const photos: PhotoRef[] = [];
  for (const p of src.photos) {
    if (!p.takenLocal?.startsWith(date)) { warnings.push(`${p.name} was not taken on ${date} (or has no capture time); it is kept out of the timeline.`); continue; }
    const t = p.takenLocal.slice(11, 16);
    const byGps = p.lat !== undefined && p.lng !== undefined ? stops.map((s, i) => ({ i, d: haversineM(s, { lat: p.lat!, lng: p.lng! }) })).filter((x) => x.d <= 150).sort((a, b) => a.d - b.d)[0] : undefined;
    const byTime = [...stops.keys()].map((i) => ({ i, d: Math.abs(hhmmToMin(stops[i].t) - hhmmToMin(t)) })).sort((a, b) => a.d - b.d)[0];
    photos.push({ path: `photos/${p.name}`, t, note: "", lat: p.lat, lng: p.lng, stopIndex: (byGps ?? byTime)?.i });
  }
  photos.sort((a, b) => a.t.localeCompare(b.t));

  // 5. Highlight candidates: best meal / park / tourist stop by dwell time, photos and workout starts.
  const scored: Candidate[] = [];
  for (const [i, s] of stops.entries()) {
    if (!s.dwellMin) continue;
    const place = await lookups.place(s.lat, s.lng);
    let kind: HighlightKind | undefined = place && place.kind !== "other" ? place.kind : undefined;
    const base = s.dwellMin + photos.filter((p) => p.stopIndex === i).length * 15 + (workouts.some((w) => w.type === "walking" || w.type === "walk" ? Math.abs(hhmmToMin(w.t) - hhmmToMin(s.t)) <= 20 : false) ? 30 : 0);
    if (!kind) {
      const wiki = (await lookups.landmarks(s.lat, s.lng)).filter((l) => l.distanceM <= 250 && l.image);
      if (wiki.length) { kind = "tourist"; scored.push({ kind, stopIndex: i, label: s.label, score: base * 0.5, landmarks: [] }); }
      continue;
    }
    scored.push({ kind, stopIndex: i, label: place?.name ?? s.label, score: base, landmarks: [], detail: place?.detail });
  }
  const candidates: Candidate[] = [];
  for (const kind of ["tourist", "meal", "park"] as const) {
    const best = scored.filter((c) => c.kind === kind).sort((a, b) => b.score - a.score)[0];
    if (!best) { warnings.push(`No ${kind === "tourist" ? "touristy spot" : kind} was recognised in this day; the world needs exactly 3 highlights (tourist, meal, park).`); continue; }
    best.landmarks = (await lookups.landmarks(stops[best.stopIndex].lat, stops[best.stopIndex].lng)).slice(0, 6);
    candidates.push(best);
  }

  const locations: Stop[] = stops.map(({ startIso: _startIso, ...s }) => s);
  const input: DayInput = { user: { name: (options.userName ?? "YOU").toUpperCase() }, date, locations, transport, photos, workouts, notes: options.notes ?? "" };
  return { input, candidates, warnings };
}
