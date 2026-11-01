// Builds the synthetic demo "location package": a day of phone-style exports that follows real London streets.
//   npx tsx scripts/make-route-package.mts
// Walking and bus legs are routed with the public OSRM service (street-following geometry); tube legs are straight lines.
// The output is committed, so running the demo never needs the network. The data is synthetic: nobody walked this exact route.
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "data/demo-package";
const DATE = "2026-11-07";
type LL = [number, number]; // lat, lng

const P = {
  parl: [51.5007, -0.1246], bridge: [51.5009, -0.122], eye: [51.5033, -0.1196], busstop: [51.501, -0.126],
  tcr1: [51.5163, -0.1303], kanada: [51.5157, -0.1281], tcr2: [51.5165, -0.131], oxford: [51.5152, -0.1419],
  regents: [51.5234, -0.1466], qmg: [51.5268, -0.153], triton: [51.5274, -0.1555], lake: [51.5262, -0.159],
} satisfies Record<string, LL>;
type Id = keyof typeof P;

const visits: { id: Id; start: string; end: string }[] = [
  { id: "parl", start: "10:00", end: "10:22" }, { id: "bridge", start: "10:25", end: "10:43" }, { id: "eye", start: "10:45", end: "12:00" },
  { id: "busstop", start: "12:05", end: "12:10" }, { id: "kanada", start: "12:40", end: "13:34" },
  { id: "qmg", start: "14:15", end: "14:46" }, { id: "triton", start: "14:50", end: "15:16" }, { id: "lake", start: "15:20", end: "15:50" },
];
type Mode = "WALKING" | "IN_BUS" | "IN_SUBWAY";
const moves: { from: Id; to: Id; start: string; end: string; mode: Mode }[] = [
  { from: "parl", to: "bridge", start: "10:22", end: "10:25", mode: "WALKING" }, { from: "bridge", to: "eye", start: "10:43", end: "10:45", mode: "WALKING" },
  { from: "eye", to: "busstop", start: "12:00", end: "12:05", mode: "WALKING" }, { from: "busstop", to: "tcr1", start: "12:10", end: "12:30", mode: "IN_BUS" },
  { from: "tcr1", to: "kanada", start: "12:30", end: "12:40", mode: "WALKING" }, { from: "kanada", to: "tcr2", start: "13:34", end: "13:40", mode: "WALKING" },
  { from: "tcr2", to: "oxford", start: "13:40", end: "13:50", mode: "IN_SUBWAY" }, { from: "oxford", to: "regents", start: "13:50", end: "14:00", mode: "IN_SUBWAY" },
  { from: "regents", to: "qmg", start: "14:00", end: "14:15", mode: "WALKING" }, { from: "qmg", to: "triton", start: "14:46", end: "14:50", mode: "WALKING" },
  { from: "triton", to: "lake", start: "15:16", end: "15:20", mode: "WALKING" },
];

// Deterministic jitter so regenerating gives the same bytes.
let seed = 20261107;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (hm: string, sec = 0) => { const [h, m] = hm.split(":").map(Number); return new Date(Date.UTC(2026, 10, 7, h, m, sec)).toISOString().replace(".000Z", ".000+00:00"); };
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const ll = ([a, b]: LL) => `${a.toFixed(6)}°, ${b.toFixed(6)}°`;
const metres = (a: LL, b: LL) => { const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; return 12742000 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2)); };

async function route(profile: "foot" | "driving", via: LL[]): Promise<LL[]> {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${via.map(([a, b]) => `${b},${a}`).join(";")}?overview=full&geometries=geojson`;
  try {
    const r = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
    const pts = r.routes?.[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LL);
    const full = pts?.length ? [via[0], ...pts, via[via.length - 1]] : undefined;
    const length = (p: LL[]) => p.slice(1).reduce((n, q, i) => n + metres(p[i], q), 0);
    // Footpaths inside parks and across rivers can make OSRM take a huge detour; keep the direct line then.
    if (full && length(full) <= 2.2 * length(via)) return full;
  } catch { /* fall through */ }
  console.warn("OSRM unavailable, using a straight line for", url.slice(0, 90));
  return via;
}

/** Sample `path` once every `everySec` seconds between two clock times at constant speed. */
function along(path: LL[], start: string, end: string, everySec: number, jitterM: number) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metres(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || 1, secs = (mins(end) - mins(start)) * 60, out: { point: string; time: string }[] = [];
  for (let s = 0; s <= secs; s += everySec) {
    const d = (s / secs) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = path[i - 1], b = path[i];
    const jit = (n: number) => ((rand() - 0.5) * 2 * jitterM) / (n === 0 ? 111000 : 69000);
    out.push({ point: ll([a[0] + (b[0] - a[0]) * f + jit(0), a[1] + (b[1] - a[1]) * f + jit(1)]), time: iso(start, s) });
  }
  return out;
}

await mkdir(OUT, { recursive: true });
const segments: object[] = [];
const routed = new Map<number, LL[]>();
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
for (const [i, m] of moves.entries()) {
  if (m.mode === "IN_SUBWAY") { routed.set(i, [P[m.from], P[m.to]]); continue; }
  const path = await route(m.mode === "IN_BUS" ? "driving" : "foot", [P[m.from], P[m.to]]);
  routed.set(i, path);
  if (m.mode !== "WALKING") continue;
  // People walk about 1.35 m/s: set the start from the distance, and end the previous visit when the walk begins.
  const dist = path.slice(1).reduce((n, q, k) => n + metres(path[k], q), 0);
  m.start = hhmm(mins(m.end) - Math.max(2, Math.ceil(dist / 1.35 / 60)));
  const prev = visits.find((v) => v.id === m.from && mins(v.end) >= mins(m.start) - 6 && mins(v.end) <= mins(m.start) + 60 && mins(v.start) < mins(m.end));
  if (prev) prev.end = m.start;
}

const emitVisits = () => { for (const v of visits) segments.push({ startTime: iso(v.start), endTime: iso(v.end), visit: { probability: 0.92, topCandidate: { placeLocation: { latLng: ll(P[v.id]) }, semanticType: "UNKNOWN" } } }); };
emitVisits();
for (const m of moves) {
  const path = routed.get(moves.indexOf(m))!;
  const timelinePath = along(path, m.start, m.end, m.mode === "WALKING" ? 20 : 30, m.mode === "WALKING" ? 2.5 : 1);
  const distance = path.slice(1).reduce((n, p, i) => n + metres(path[i], p), 0);
  segments.push({ startTime: iso(m.start), endTime: iso(m.end), activity: { start: { latLng: ll(P[m.from]) }, end: { latLng: ll(P[m.to]) }, distanceMeters: Math.round(distance), topCandidate: { type: m.mode, probability: 0.85 } }, timelinePath });
}
segments.sort((a, b) => (a as { startTime: string }).startTime.localeCompare((b as { startTime: string }).startTime));
await writeFile(`${OUT}/timeline.json`, JSON.stringify({ semanticSegments: segments }, null, 1));

// GPX: the Regent's Park walk (14:15 to 15:30) as one timed track, one point a minute, looping back through the gardens.
const walk = await route("foot", [P.qmg, P.triton, P.lake, P.qmg]);
const gpxPts = along(walk, "14:15", "15:30", 60, 2);
await writeFile(`${OUT}/route.gpx`, `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="dayquest-demo-package" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><desc>Synthetic demo route; not a real recording.</desc></metadata>
 <trk><name>Regent's Park walk</name><type>walking</type><trkseg>
${gpxPts.map((p) => { const [a, b] = p.point.replace(/°/g, "").split(",").map(Number); return `   <trkpt lat="${a.toFixed(6)}" lon="${b.toFixed(6)}"><time>${p.time.replace(".000+00:00", "Z")}</time></trkpt>`; }).join("\n")}
 </trkseg></trk>
</gpx>
`);

const stamp = (hm: string) => `${DATE} ${hm}:00 +0000`;
const steps = [["14:15", "14:30", 1300], ["14:30", "14:45", 1250], ["14:45", "15:00", 1350], ["15:00", "15:15", 1300]] as const;
await writeFile(`${OUT}/health-export.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <ExportDate value="2026-11-08 08:00:00 +0000"/>
${steps.map(([a, b, v]) => `  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="${stamp(a)}" endDate="${stamp(b)}" value="${v}"/>`).join("\n")}
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="75" durationUnit="min" totalDistance="3.8" totalDistanceUnit="km" sourceName="Watch" startDate="${stamp("14:15")}" endDate="${stamp("15:30")}"/>
</HealthData>
`);

// Recorded answers for the network lookups (OSM, Wikipedia, TfL), so the package ingests the same way offline. Hand-checked, not scraped.
const key = (p: LL) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
const labels: Record<Id, string> = { parl: "Elizabeth Tower / Parliament Square", bridge: "Westminster Bridge", eye: "London Eye", busstop: "Parliament Square bus stop", tcr1: "Tottenham Court Road Station",
  kanada: "Kanada-Ya, 64 St Giles High St", tcr2: "Tottenham Court Road Station", oxford: "Oxford Circus Station", regents: "Regent's Park Station", qmg: "Queen Mary's Gardens", triton: "Triton Fountain", lake: "Regent's Park Boating Lake" };
const recorded = {
  note: "Synthetic demo package. Answers below were checked by hand against OpenStreetMap, Wikipedia and TfL, not recorded from a live run.",
  labels: Object.fromEntries((Object.keys(P) as Id[]).map((id) => [key(P[id]), labels[id]])),
  places: {
    [key(P.eye)]: { name: "London Eye", kind: "tourist" },
    [key(P.kanada)]: { name: "Kanada-Ya, 64 St Giles High St", kind: "meal", detail: "ramen" },
    [key(P.qmg)]: { name: "Queen Mary's Gardens", kind: "park" },
  },
  landmarks: {
    [key(P.parl)]: [{ title: "Big Ben", lat: 51.5007, lng: -0.1246, distanceM: 20, summary: "The Great Bell of the Great Clock of Westminster" }, { title: "Palace of Westminster", lat: 51.4995, lng: -0.1248, distanceM: 120 }, { title: "Red telephone box", lat: 51.5008, lng: -0.1238, distanceM: 60 }],
    [key(P.eye)]: [{ title: "London Eye", lat: 51.5033, lng: -0.1196, distanceM: 10 }, { title: "The Shard", lat: 51.5045, lng: -0.0865, distanceM: 2300 }],
    [key(P.kanada)]: [{ title: "Kanada-Ya", lat: 51.5157, lng: -0.1281, distanceM: 5 }, { title: "Centre Point", lat: 51.5160, lng: -0.1286, distanceM: 40 }],
    [key(P.qmg)]: [{ title: "Queen Mary's Gardens", lat: 51.5268, lng: -0.153, distanceM: 10 }, { title: "Triton Fountain", lat: 51.5274, lng: -0.1555, distanceM: 180 }, { title: "Regent's Park Boating Lake", lat: 51.5262, lng: -0.159, distanceM: 400 }],
  },
  transit: {
    [`bus:${key(P.busstop)}>${key(P.tcr1)}`]: [{ mode: "bus", route: "24", destination: "Hampstead Heath", from: "Parliament Square", to: "Tottenham Court Road Station", routeSource: "hint" }],
    [`tube:${key(P.tcr2)}>${key(P.oxford)}`]: [{ mode: "tube", line: "Central", from: "Tottenham Court Road", to: "Oxford Circus", stations: ["Tottenham Court Road", "Oxford Circus"] }],
    [`tube:${key(P.oxford)}>${key(P.regents)}`]: [{ mode: "tube", line: "Bakerloo", from: "Oxford Circus", to: "Regent's Park", stations: ["Oxford Circus", "Regent's Park"] }],
  },
};
await writeFile(`${OUT}/lookups.recorded.json`, JSON.stringify(recorded, null, 1));
await writeFile(`${OUT}/README.md`, `# Synthetic demo package\n\nA made-up day in London, in the formats a phone exports. **Nobody walked this exact route.** Walking and bus geometry follows real streets (OSRM); tube legs are straight lines.\n\n- \`timeline.json\` Google Timeline (visits, activities with \`timelinePath\` GPS points every 20-30 s)\n- \`health-export.xml\` one 75-minute walk with steps\n- \`route.gpx\` the Regent's Park walk\n- \`lookups.recorded.json\` hand-checked answers standing in for the OSM, Wikipedia and TfL lookups, so the demo runs offline\n\nRegenerate: \`npx tsx scripts/make-route-package.mts\`. Photos are not included; use \`scripts/restamp-photos.mts\` to fit your own photos to this timeline.\n`);
console.log(`package written: ${segments.length} segments, ${gpxPts.length} GPX points`);
