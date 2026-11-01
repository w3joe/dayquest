// Runs the fixtures through the real pipeline (OSM, Wikipedia, TfL over the network) and prints the result.
// Run: npx tsx scripts/ingest-demo.mts [--write]   (--write replaces data/input.json)
import { readFile, writeFile } from "node:fs/promises";
import { ingest } from "../lib/ingest/build";
import { readPhotoMeta } from "../lib/ingest/photos";
import { liveLookups } from "../lib/ingest/places";

const dir = "data/fixtures";
const photos = await Promise.all(["westminster", "eye", "ramen", "park"].map(async (n) => readPhotoMeta(`${n}.jpg`, await readFile(`${dir}/${n}.jpg`))));
const result = await ingest({ timeline: await readFile(`${dir}/timeline.json`, "utf8"), health: await readFile(`${dir}/health-export.xml`, "utf8"), gpx: await readFile(`${dir}/route.gpx`, "utf8"), photos },
  { userName: "Lucas", notes: "Saturday tourist day.", lookups: liveLookups });
console.log(JSON.stringify({ ...result, input: { ...result.input, workouts: result.input.workouts.map((w) => ({ ...w, route: w.route && `${w.route.length} points` })) } }, null, 2));
if (process.argv.includes("--write")) await writeFile("data/input.generated.json", JSON.stringify(result.input, null, 2));
