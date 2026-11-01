import assert from "node:assert/strict";
import test from "node:test";
import { parseLocationHistory } from "../lib/location-history";

test("parses classic Takeout records", () => {
  const points = parseLocationHistory(JSON.stringify({ locations: [{ latitudeE7: 515007000, longitudeE7: -1246000, timestamp: "2026-11-01T10:00:00Z" }] }));
  assert.deepEqual(points.map(p => [p.lat, p.lng]), [[51.5007, -0.1246]]);
  assert.equal(points[0].t, Date.parse("2026-11-01T10:00:00Z"));
});

test("parses Timeline export visits and paths", () => {
  const points = parseLocationHistory(JSON.stringify({ semanticSegments: [
    { startTime: "2026-11-01T10:00:00Z", visit: { topCandidate: { placeLocation: { latLng: "51.5007°, -0.1246°" } } } },
    { startTime: "2026-11-01T11:00:00Z", timelinePath: [{ point: "51.5033°, -0.1196°", time: "2026-11-01T11:05:00Z" }] },
  ] }));
  assert.equal(points.length, 2);
});

test("parses GPX track points", () => {
  const points = parseLocationHistory('<gpx><trk><trkseg><trkpt lat="51.5" lon="-0.12"><time>2026-11-01T10:00:00Z</time></trkpt><trkpt lat="51.51" lon="-0.13"/></trkseg></trk></gpx>', "walk.gpx");
  assert.equal(points.length, 2);
});

test("rejects unreadable or empty files", () => {
  assert.throws(() => parseLocationHistory("nope"), /couldn’t read/);
  assert.throws(() => parseLocationHistory("{}"), /No locations/);
});
