import assert from "node:assert/strict";
import test from "node:test";
import { CENTRAL_STATIONS, clusterPlaces, guessConnections, nearestStation, tflPlanner, type PhotoMeta } from "../pipeline/photo-itinerary";

// The demo photos: ramen lunch in Soho, Big Ben at dusk, bubble tea in Chinatown. Plus a character photo that must never become a place.
const photos: PhotoMeta[] = [
  { id: "tea", kind: "park", takenAt: "2026-11-07 16:40", lat: 51.5113, lng: -0.1311 },
  { id: "bigben", kind: "landmark", takenAt: "2026-11-07 15:20", lat: 51.5007, lng: -0.1246 },
  { id: "ramen", kind: "lunch", takenAt: "2026-11-07 12:55", lat: 51.5157, lng: -0.1281 },
  { id: "me", kind: "fit", takenAt: "2026-11-07 09:00", lat: 51.5, lng: -0.12 },
];

test("places: ordered by time, character photos excluded", () => {
  const places = clusterPlaces(photos);
  assert.deepEqual(places.map((p) => p.photoIds), [["ramen"], ["bigben"], ["tea"]]);
  assert.deepEqual(places.map((p) => p.time), ["12:55", "15:20", "16:40"]);
  assert.deepEqual(places.map((p) => p.id), ["place_1", "place_2", "place_3"], "ids are valid scene ids");
});

test("places: photos close together are one place; far apart are separate", () => {
  const near = clusterPlaces([{ id: "a", kind: "landmark", takenAt: "2026-11-07 10:00", lat: 51.5007, lng: -0.1246 }, { id: "b", kind: "lunch", takenAt: "2026-11-07 10:30", lat: 51.5011, lng: -0.1240 }]);
  assert.equal(near.length, 1);
  assert.deepEqual(near[0].photoIds, ["a", "b"]);
  assert.equal(clusterPlaces([{ id: "a", kind: "landmark", lat: 51.5007, lng: -0.1246 }, { id: "b", kind: "lunch", lat: 51.5157, lng: -0.1281 }]).length, 2);
});

test("places: a photo with no GPS joins the place nearest in time; no GPS at all gives no places", () => {
  const places = clusterPlaces([...photos, { id: "nogps", kind: "lunch", takenAt: "2026-11-07 15:30" }]);
  assert.ok(places[1].photoIds.includes("nogps"), "15:30 is closest to Big Ben at 15:20");
  assert.deepEqual(clusterPlaces([{ id: "x", kind: "lunch" }, { id: "y", kind: "landmark" }]), []);
});

test("stations: nearest to each demo place", () => {
  assert.equal(nearestStation({ lat: 51.5157, lng: -0.1281 })!.name, "Tottenham Court Road");
  assert.equal(nearestStation({ lat: 51.5007, lng: -0.1246 })!.name, "Westminster");
  assert.equal(nearestStation({ lat: 51.5113, lng: -0.1311 })!.name, "Leicester Square");
  assert.equal(nearestStation({ lat: 53.4808, lng: -2.2426 }), undefined, "nothing near Manchester");
  assert.equal(new Set(CENTRAL_STATIONS.map((s) => s.name)).size, CENTRAL_STATIONS.length);
});

test("connections: Tube between the nearest stations, always flagged as estimated", async () => {
  const connections = await guessConnections(clusterPlaces(photos));
  assert.equal(connections.length, 2);
  assert.deepEqual(connections.map((c) => [c.fromSceneId, c.toSceneId]), [["place_1", "place_2"], ["place_2", "place_3"]]);
  const first = connections[0].legs[0];
  assert.ok(first.mode === "tube" && first.stations[0] === "Tottenham Court Road" && first.stations[1] === "Westminster" && first.estimated === true);
  for (const c of connections) for (const leg of c.legs) assert.equal(leg.estimated, true);
});

test("connections: same station or no station nearby becomes a walk", async () => {
  const sameStation = await guessConnections(clusterPlaces([{ id: "a", kind: "landmark", lat: 51.5007, lng: -0.1246 }, { id: "b", kind: "lunch", lat: 51.4999, lng: -0.1262 }, { id: "c", kind: "lunch", lat: 51.5015, lng: -0.1230 }]));
  assert.ok(sameStation.every((c) => c.legs[0].mode === "walk"));
  const faraway = await guessConnections(clusterPlaces([{ id: "a", kind: "landmark", lat: 53.4808, lng: -2.2426 }, { id: "b", kind: "lunch", lat: 53.4900, lng: -2.2500 }]));
  assert.equal(faraway[0].legs[0].mode, "walk");
});

test("planner: TfL's answer replaces the generic leg, with the real line colour", async () => {
  const fake = (async () => new Response(JSON.stringify({ journeys: [{ legs: [
    { mode: { id: "walking" } },
    { mode: { id: "tube" }, routeOptions: [{ name: "Northern line" }], path: { stopPoints: [{ name: "Leicester Square Underground Station" }, { name: "Embankment Underground Station" }] } },
    { mode: { id: "tube" }, routeOptions: [{ name: "District" }], path: { stopPoints: [{ name: "Embankment Underground Station" }, { name: "Westminster Underground Station" }] } },
  ] }] }))) as unknown as typeof fetch;
  const [c] = await guessConnections(clusterPlaces(photos.slice(0, 3)), { planner: tflPlanner(fake) });
  const legs = c.legs.filter((l) => l.mode === "tube");
  assert.deepEqual(legs.map((l) => (l.mode === "tube" ? [l.line, l.color, l.stations] : [])), [
    ["Northern", "#000000", ["Leicester Square", "Embankment"]], ["District", "#00782A", ["Embankment", "Westminster"]]]);
  assert.ok(legs.every((l) => l.estimated));
});

test("planner: any failure falls back to the generic Tube leg instead of throwing", async () => {
  for (const broken of [(async () => { throw new Error("offline"); }) as unknown as typeof fetch, (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
    (async () => new Response(JSON.stringify({ journeys: [] }))) as unknown as typeof fetch]) {
    const [c] = await guessConnections(clusterPlaces(photos), { planner: tflPlanner(broken) });
    assert.ok(c.legs[0].mode === "tube" && c.legs[0].line === "Underground" && c.legs[0].estimated === true);
  }
});
