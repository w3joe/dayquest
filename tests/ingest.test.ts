import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ingest } from "../lib/ingest/build";
import { parseGpx } from "../lib/ingest/gpx";
import { parseHealth } from "../lib/ingest/health";
import { readPhotoMeta } from "../lib/ingest/photos";
import { parseTimeline } from "../lib/ingest/timeline";
import type { Lookups, Stop, TransportLeg } from "../lib/ingest/types";
import demo from "../data/input.json";

const fx = (name: string) => readFile(`data/fixtures/${name}`, "utf8");
const key = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

// Offline stand-ins for OSM / Wikipedia / TfL, keyed by the demo day's coordinates.
const labels = new Map(demo.locations.map((l) => [key(l.lat, l.lng), l.label]));
const places: Record<string, { name: string; kind: "tourist" | "meal" | "park"; detail?: string }> = {
  [key(51.5033, -0.1196)]: { name: "London Eye", kind: "tourist" },
  [key(51.5157, -0.1281)]: { name: "Kanada-Ya, 64 St Giles High St", kind: "meal", detail: "ramen" },
  [key(51.5268, -0.153)]: { name: "Queen Mary's Gardens", kind: "park" },
};
const stub: Lookups = {
  label: async (lat, lng) => labels.get(key(lat, lng)),
  place: async (lat, lng) => places[key(lat, lng)],
  landmarks: async () => [{ title: "Big Ben", lat: 51.5007, lng: -0.1246, distanceM: 20, image: "x.jpg" }],
  transit: async (from: Stop, to: Stop, mode): Promise<TransportLeg[]> => mode === "bus"
    ? [{ mode: "bus", route: "24", destination: "Hampstead Heath", from: "Parliament Square", to: "Tottenham Court Road Station" }]
    : to.label.startsWith("Oxford") ? [{ mode: "tube", line: "Central", from: from.label, to: to.label, stations: [from.label, to.label] }]
      : [{ mode: "tube", line: "Bakerloo", from: from.label, to: to.label, stations: [from.label, to.label] }],
};

test("timeline: parses the on-device export and Takeout's legacy format", async () => {
  const t = parseTimeline(await fx("timeline.json"));
  assert.equal(t.visits.length, 8);
  assert.deepEqual(t.movements.filter((m) => m.type === "IN_SUBWAY").length, 2);
  assert.deepEqual([t.visits[0].lat, t.visits[0].lng], [51.5007, -0.1246]);
  const legacy = parseTimeline(JSON.stringify({ timelineObjects: [
    { placeVisit: { location: { latitudeE7: 515157000, longitudeE7: -1281000, name: "Kanada-Ya" }, duration: { startTimestamp: "2026-11-07T12:40:00Z", endTimestamp: "2026-11-07T13:40:00Z" } } },
    { activitySegment: { activityType: "IN_BUS", startLocation: { latitudeE7: 515010000, longitudeE7: -1260000 }, endLocation: { latitudeE7: 515163000, longitudeE7: -1303000 }, distance: 2300, duration: { startTimestamp: "2026-11-07T12:10:00Z", endTimestamp: "2026-11-07T12:30:00Z" } } }] }));
  assert.equal(legacy.visits[0].name, "Kanada-Ya");
  assert.equal(legacy.movements[0].type, "IN_BUS");
  assert.throws(() => parseTimeline("{}"), /Unrecognised/);
  assert.throws(() => parseTimeline("nope"), /not valid JSON/);
});

test("health: workout stats and steps summed inside the workout window only", async () => {
  const w = parseHealth(await fx("health-export.xml"));
  assert.equal(w.length, 2);
  const walk = w.find((x) => x.type === "walking")!;
  assert.deepEqual([walk.durationMin, walk.distanceKm, walk.steps], [75, 3.8, 5200]);
  assert.throws(() => parseHealth("<foo/>"), /Health/);
});

test("gpx: distance and duration from timed points", async () => {
  const [g] = parseGpx(await fx("route.gpx"));
  assert.equal(g.durationMin, 75);
  assert.ok(g.distanceKm > 0.5 && g.distanceKm < 5, `distance ${g.distanceKm}`);
  assert.throws(() => parseGpx("<xml/>"), /GPX/);
});

test("photos: EXIF capture time and GPS survive reading", async () => {
  const meta = await readPhotoMeta("ramen.jpg", await readFile("data/fixtures/ramen.jpg"));
  assert.equal(meta.takenLocal, "2026-11-07 12:55");
  assert.ok(Math.abs(meta.lat! - 51.5157) < 0.001 && Math.abs(meta.lng! + 0.1281) < 0.001);
  assert.deepEqual(await readPhotoMeta("x.txt", new TextEncoder().encode("not an image")), { name: "x.txt" });
});

test("end to end: the fixtures reproduce the committed demo day (data/input.json)", async () => {
  const photos = await Promise.all(["westminster", "eye", "ramen", "park"].map(async (n) => readPhotoMeta(`${n}.jpg`, await readFile(`data/fixtures/${n}.jpg`))));
  const { input, candidates, warnings } = await ingest(
    { timeline: await fx("timeline.json"), health: await fx("health-export.xml"), gpx: await fx("route.gpx"), photos },
    { userName: "Lucas", lookups: stub });
  assert.equal(input.date, "2026-11-07");
  assert.deepEqual(input.locations.map((l) => [l.t, l.label]), demo.locations.map((l) => [l.t, l.label]));
  assert.deepEqual(input.transport.map((l) => l.mode === "bus" ? `bus ${l.route}` : `tube ${l.line}`), demo.transport.map((l) => l.mode === "bus" ? `bus ${l.route}` : `tube ${l.line}`));
  assert.equal(input.workouts.length, 1);
  assert.deepEqual([input.workouts[0].t, input.workouts[0].distanceKm, input.workouts[0].durationMin, input.workouts[0].steps], ["14:15", 3.8, 75, 5200]);
  assert.ok(input.workouts[0].route!.length > 10, "GPX route attached to the Health workout");
  assert.deepEqual(input.photos.map((p) => [p.t, input.locations[p.stopIndex!].label.split(",")[0]]), [
    ["10:20", "Westminster Bridge"], ["11:10", "London Eye"], ["12:55", "Kanada-Ya"], ["14:30", "Queen Mary's Gardens"]]);
  assert.deepEqual(candidates.map((c) => [c.kind, c.label]), [["tourist", "London Eye"], ["meal", "Kanada-Ya, 64 St Giles High St"], ["park", "Queen Mary's Gardens"]]);
  assert.deepEqual(warnings, []);
});

test("missing sources degrade with warnings instead of failing", async () => {
  await assert.rejects(ingest({}, { lookups: stub }), /Timeline/);
  const r = await ingest({ timeline: await fx("timeline.json"), health: "<broken/>" }, { lookups: { ...stub, transit: async () => undefined } });
  assert.ok(r.warnings.some((w) => /Health/.test(w)));
  assert.ok(r.warnings.some((w) => /bus route/.test(w)));
  assert.equal(r.input.transport[0].mode, "bus");
});
