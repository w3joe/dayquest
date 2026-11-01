// Generates the NPC and interactable sprites in lib/actor-library.ts with the OpenAI image API and the project's own pixel post-process.
//   npx tsx scripts/generate-actor-library.mts [--only bell,cat] [--limit 3] [--force]
// Real sprites are recorded in actors/.generated.json so reruns skip them; placeholders are replaced.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ACTOR_LIBRARY } from "../lib/actor-library";
import { ISOLATED_OBJECT } from "../lib/art-style";
import { mapLimit, openAIImageGenerator } from "../pipeline/imagegen";
import { pixelateSceneSprite } from "../pipeline/pixelate";

try { process.loadEnvFile(".env"); } catch { /* the key may already be in the environment */ }
const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1] ?? "true"; };
const only = flag("only")?.split(","), limit = Number(flag("limit")) || Infinity, force = process.argv.includes("--force");

const dir = path.join(process.cwd(), "public/tiles/dq/library/actors");
const ledgerPath = path.join(dir, ".generated.json");
await mkdir(dir, { recursive: true });
const done: string[] = existsSync(ledgerPath) ? JSON.parse(await readFile(ledgerPath, "utf8")) : [];

const todo = ACTOR_LIBRARY.filter((a) => (!only || only.includes(a.id)) && (force || !done.includes(a.id))).slice(0, limit);
if (!todo.length) { console.log("nothing to generate"); process.exit(0); }
console.log(`generating ${todo.length} sprite(s): ${todo.map((a) => a.id).join(", ")}`);

const generator = openAIImageGenerator();
let failures = 0;
await mapLimit(todo, 3, async (actor) => {
  const subject = actor.role === "npc"
    ? `A single friendly character, full body, standing, seen from the front at a slight three-quarter angle: ${actor.art}.`
    : `A single object seen in three-quarter top-down view: ${actor.art}.`;
  const prompt = `${ISOLATED_OBJECT} ${subject} A small sprite for a cosy, warm, walkable neighbourhood. Clear dark outline, soft warm colours, simple readable shapes.`;
  try {
    const raw = await generator.generate({ prompt, references: [], kind: "landmark", name: actor.name });
    await writeFile(path.join(dir, `${actor.id}.png`), await pixelateSceneSprite(raw, actor.width, actor.height));
    done.push(actor.id);
    await writeFile(ledgerPath, JSON.stringify([...new Set(done)].sort(), null, 1));
    console.log(`  ok  ${actor.id}`);
  } catch (error) {
    failures++;
    console.error(`  FAILED ${actor.id}: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}`);
  }
});
console.log(failures ? `${failures} failed; rerun to retry only those` : "all generated");
process.exit(failures ? 1 : 0);
