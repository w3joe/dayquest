/**
 * Pre-generate the demo day into public/days/demo/ and record events.ndjson for /generating?replay=demo.
 *
 *   npm run demo:generate                                   # mock: placeholder art, no API calls
 *   PIPELINE_TEXT=live PIPELINE_IMAGES=live npm run demo:generate -- --player sprite.png --lunch ramen.jpg
 *
 * Flags: --player <png> (finished 32×48 sprite), --fit/--lunch/--landmark/--park <photo>.
 * Reads OPENAI_API_KEY from the environment or .env.local.
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { modeFromEnv, runGenerateDay } from "@/pipeline/generate";
import { localDayStore } from "@/pipeline/publish";
import type { DayInput, GenerateEvent, UploadKind } from "@/pipeline/types";

try { process.loadEnvFile(".env.local"); } catch { /* optional */ }

const { values } = parseArgs({
  options: {
    player: { type: "string" }, fit: { type: "string" }, lunch: { type: "string" }, landmark: { type: "string" }, park: { type: "string" },
    out: { type: "string", default: "public/days/demo" },
  },
});

// Photos are re-encoded so no EXIF (GPS, capture time) reaches the pipeline or the repo.
const photo = async (file?: string) => file ? sharp(await readFile(file)).rotate().png().toBuffer() : undefined;

const dir = path.resolve(values.out!);
const input = JSON.parse(await readFile("data/input.json", "utf8")) as DayInput;
const uploads: Partial<Record<UploadKind, Buffer>> = {};
for (const kind of ["fit", "lunch", "landmark", "park"] as const) {
  const bytes = await photo(values[kind]);
  if (bytes) uploads[kind] = bytes;
}
const mode = modeFromEnv();
console.log(`text: ${mode.livePlan ? "LIVE" : "mock"} · images: ${mode.images.live ? "LIVE" : "mock"} → ${dir}`);

await rm(dir, { recursive: true, force: true });
const started = Date.now();
const events: GenerateEvent[] = [];
await runGenerateDay({
  id: "demo", input, store: localDayStore(dir, "/days/demo/day.json"), uploads,
  player: values.player ? await readFile(values.player) : undefined, ...mode,
}, (event) => {
  events.push({ ...event, at: Date.now() - started });
  console.log(`${String(Date.now() - started).padStart(6)}ms  ${event.label}`);
});
await writeFile(path.join(dir, "events.ndjson"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`done: ${events.length} events, open /day/demo or /generating?replay=demo`);
