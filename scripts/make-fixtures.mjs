// Writes demo-day source files in the real export formats (Google Timeline, Apple Health, GPX, EXIF photos).
// They are synthetic stand-ins for a phone's exports, matching data/input.json. Run: node scripts/make-fixtures.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = "data/fixtures";
const D = "2026-11-07";
const iso = (hm) => `${D}T${hm}:00.000+00:00`;
const ll = (lat, lng) => `${lat}°, ${lng}°`;

const visit = (a, b, lat, lng) => ({ startTime: iso(a), endTime: iso(b), visit: { probability: 0.9, topCandidate: { placeLocation: { latLng: ll(lat, lng) }, semanticType: "UNKNOWN" } } });
const move = (a, b, from, to, type, m) => ({ startTime: iso(a), endTime: iso(b), activity: { start: { latLng: ll(...from) }, end: { latLng: ll(...to) }, distanceMeters: m, topCandidate: { type, probability: 0.8 } } });

const segments = [
  visit("10:00", "10:25", 51.5007, -0.1246),
  visit("10:25", "10:45", 51.5009, -0.122),
  visit("10:45", "12:05", 51.5033, -0.1196),
  move("12:05", "12:05", [51.5033, -0.1196], [51.501, -0.126], "WALKING", 700),
  visit("12:05", "12:10", 51.501, -0.126),
  move("12:10", "12:30", [51.501, -0.126], [51.5163, -0.1303], "IN_BUS", 2300),
  move("12:30", "12:40", [51.5163, -0.1303], [51.5157, -0.1281], "WALKING", 160),
  visit("12:40", "13:40", 51.5157, -0.1281),
  move("13:40", "13:40", [51.5157, -0.1281], [51.5165, -0.131], "WALKING", 170),
  move("13:40", "13:50", [51.5165, -0.131], [51.5152, -0.1419], "IN_SUBWAY", 800),
  move("13:50", "14:00", [51.5152, -0.1419], [51.5234, -0.1466], "IN_SUBWAY", 950),
  move("14:00", "14:15", [51.5234, -0.1466], [51.5268, -0.153], "WALKING", 650),
  visit("14:15", "14:50", 51.5268, -0.153),
  visit("14:50", "15:20", 51.5274, -0.1555),
  visit("15:20", "15:50", 51.5262, -0.159),
];
await writeFile(`${OUT}/timeline.json`, JSON.stringify({ semanticSegments: segments }, null, 2));

// Apple Health: one walk on the day (steps recorded in 15-minute buckets) plus noise the parser must ignore.
const stamp = (hm, d = D) => `${d} ${hm}:00 +0000`;
const steps = [["14:15", "14:30", 1300], ["14:30", "14:45", 1250], ["14:45", "15:00", 1350], ["15:00", "15:15", 1300], ["15:15", "15:30", 0]]
  .map(([a, b, v]) => `  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="${stamp(a)}" endDate="${stamp(b)}" value="${v}"/>`);
await writeFile(`${OUT}/health-export.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <ExportDate value="2026-11-08 08:00:00 +0000"/>
${steps.join("\n")}
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="${stamp("09:00")}" endDate="${stamp("09:15")}" value="400"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="${stamp("14:20")}" endDate="${stamp("14:20")}" value="96"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="75" durationUnit="min" totalDistance="3.8" totalDistanceUnit="km" sourceName="Watch" startDate="${stamp("14:15")}" endDate="${stamp("15:30")}"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" totalDistance="5" totalDistanceUnit="km" sourceName="Watch" startDate="${stamp("07:00", "2026-11-06")}" endDate="${stamp("07:30", "2026-11-06")}"/>
</HealthData>
`);

// GPX of the park walk: a loop through the three park stops, one point a minute.
const way = [[51.5268, -0.153], [51.5272, -0.154], [51.5274, -0.1555], [51.5268, -0.157], [51.5262, -0.159], [51.5258, -0.157], [51.5262, -0.1545], [51.5268, -0.153]];
const pts = [];
for (let i = 0; i < 76; i++) {
  const f = (i / 75) * (way.length - 1), k = Math.min(Math.floor(f), way.length - 2), r = f - k;
  const t = new Date(Date.parse(iso("14:15")) + i * 60000).toISOString();
  pts.push(`   <trkpt lat="${(way[k][0] + (way[k + 1][0] - way[k][0]) * r).toFixed(6)}" lon="${(way[k][1] + (way[k + 1][1] - way[k][1]) * r).toFixed(6)}"><time>${t}</time></trkpt>`);
}
await writeFile(`${OUT}/route.gpx`, `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="dayquest-fixture" xmlns="http://www.topografix.com/GPX/1/1">
 <trk><name>Regent's Park walk</name><type>walking</type><trkseg>
${pts.join("\n")}
 </trkseg></trk>
</gpx>
`);

// Photos with EXIF capture time and GPS (the image content is a flat colour; only the metadata matters).
const dms = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 1000); return `${d}/1 ${m}/1 ${s}/1000`; };
const photos = [["westminster", "10:20", 51.5009, -0.122, [200, 190, 160]], ["eye", "11:10", 51.5033, -0.1196, [120, 160, 200]], ["ramen", "12:55", 51.5157, -0.1281, [210, 150, 80]], ["park", "14:30", 51.5268, -0.153, [110, 170, 100]]];
for (const [name, hm, lat, lng, rgb] of photos) {
  await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .withExif({ IFD2: { DateTimeOriginal: `${D.replaceAll("-", ":")} ${hm}:00` },
      IFD3: { GPSLatitudeRef: lat >= 0 ? "N" : "S", GPSLatitude: dms(lat), GPSLongitudeRef: lng >= 0 ? "E" : "W", GPSLongitude: dms(lng) } })
    .jpeg().toFile(`${OUT}/${name}.jpg`);
}
console.log("fixtures written to", OUT);
