// Regenerates every world sprite except the main character in one chibi style, using the player character as the style reference.
//   npx tsx scripts/generate-chibi-art.mts [--group actors|furniture|buildings] [--only a,b] [--force]
// actors     -> public/tiles/dq/library/actors/<id>.png
// furniture  -> shadwell-25d/assets/<id>.png   (scripts/build-game-art.mjs derives the game library from these)
// buildings  -> shadwell-25d/assets/<id>.png   (also the style references for per-day buildings)
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ACTOR_LIBRARY } from "../lib/actor-library";
import { mapLimit, openAIImageGenerator } from "../pipeline/imagegen";
import { pixelateSceneSprite } from "../pipeline/pixelate";

try { process.loadEnvFile(".env"); } catch { /* the key may already be in the environment */ }
const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1] ?? "true"; };
const only = flag("only")?.split(","), group = flag("group"), force = process.argv.includes("--force");

type Job = { key: string; group: "actors" | "furniture" | "buildings"; id: string; file: string; width: number; height: number; subject: string };
const actorsDir = path.join(process.cwd(), "public/tiles/dq/library/actors"), assetsDir = path.join(process.cwd(), "shadwell-25d/assets");
const ledgerPath = path.join(process.cwd(), "public/tiles/dq/library/.chibi-generated.json");

const STYLE = `Cute chibi pixel-art game sprite for a cosy handheld RPG. Match the REFERENCE image's art style exactly: the same chunky square pixels, thick dark outline, 2 to 3 flat tones per colour, no dithering, noise or gradients, soft warm palette, light from the top-left, steep top-down 3/4 view. Everything is toy-like and cute: simplified, rounded, slightly oversized features, no realistic fine detail. Show ONE isolated subject, centred, fully visible with a clear margin, on a fully transparent background. No cast shadow, no ground, no text, no border.`;
const PERSON = "A NEW chibi person (not a copy of the reference's face, hair or clothes): a big round head about as tall as the whole body, a tiny simple body, short stubby arms and legs, big simple eyes, standing and facing the viewer.";
const ANIMAL = "A chibi animal: a big head, a tiny round body, a cute simple face, sitting or standing, facing the viewer.";
const PROP = "A chibi-style street prop: chunky, rounded, simplified toy-like shapes, slightly oversized and charming.";
const BUILDING = "A chibi-style small building: squat and cute, with a chunky roof, oversized friendly windows and door, simplified but recognisable details, viewed front-on with a sliver of the roof.";

const furniture: [string, number, number, string][] = [
  ["tree", 53, 60, "A round leafy green tree with a fat trunk."], ["lamp", 15, 58, "A tall black iron street lamp with a glowing yellow lantern."],
  ["bollard", 10, 20, "A short rounded grey bollard."], ["cycle_stand", 26, 28, "A metal bicycle stand shaped like an upside-down U."],
  ["aboard", 21, 28, "A small pavement A-frame sign board with a chalk drawing."], ["hedge", 55, 20, "A neat rounded green hedge."],
  ["bin_grey", 18, 26, "A grey wheelie bin with a lid."], ["bin_purple", 18, 26, "A purple recycling bin with a lid."],
  ["car_red", 59, 34, "A cute small red hatchback car seen from the side."], ["car_blue", 55, 34, "A cute small blue hatchback car seen from the side."],
];
const buildings: [string, string][] = [
  ["shop_corner", "A two-storey corner shop: red brick upper floor with two windows, a green shopfront sign reading BEN'S BITS, a window full of fruit and bread."],
  ["shop_cafe", "A two-storey cafe: cream upper floor with two windows, a teal shopfront sign reading TEA TIME, big cafe window with a table and teacup."],
  ["yellow_house", "A three-storey yellow brick house with a red tiled roof, white sash windows and a black front door."],
];
const jobs: Job[] = [
  ...ACTOR_LIBRARY.map((a): Job => ({ key: `actors/${a.id}`, group: "actors", id: a.id, file: path.join(actorsDir, `${a.id}.png`), width: a.width, height: a.height,
    subject: `${a.role === "npc" ? (a.height >= 40 ? PERSON : ANIMAL) : PROP} Subject: ${a.art}.` })),
  ...furniture.map(([id, width, height, what]): Job => ({ key: `furniture/${id}`, group: "furniture", id, file: path.join(assetsDir, `${id}.png`), width, height, subject: `${PROP} Subject: ${what}` })),
  ...buildings.map(([id, what]): Job => ({ key: `buildings/${id}`, group: "buildings", id, file: path.join(assetsDir, `${id}.png`), width: 160, height: 128, subject: `${BUILDING} Subject: ${what}` })),
];

const done: string[] = existsSync(ledgerPath) ? JSON.parse(await readFile(ledgerPath, "utf8")) : [];
const todo = jobs.filter((j) => (!group || j.group === group) && (!only || only.includes(j.id)) && (force || !done.includes(j.key)));
if (!todo.length) { console.log("nothing to generate"); process.exit(0); }
console.log(`generating ${todo.length}: ${todo.map((j) => j.id).join(", ")}`);

// The main character, enlarged without smoothing, is the single style reference.
const reference = await sharp(path.join(assetsDir, "shawn.png")).extract({ left: 0, top: 0, width: 32, height: 48 }).resize(192, 288, { kernel: "nearest" }).png().toBuffer();
await mkdir(actorsDir, { recursive: true });
const generator = openAIImageGenerator();
let failures = 0;
await mapLimit(todo, 3, async (job) => {
  try {
    const raw = await generator.generate({ prompt: `${STYLE} ${job.subject}`, references: [reference], kind: "landmark", name: job.id });
    await writeFile(job.file, await pixelateSceneSprite(raw, job.width, job.height));
    done.push(job.key);
    await writeFile(ledgerPath, JSON.stringify([...new Set(done)].sort(), null, 1));
    console.log(`  ok  ${job.key}`);
  } catch (error) { failures++; console.error(`  FAILED ${job.key}: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}`); }
});
console.log(failures ? `${failures} failed; rerun to retry only those` : "all generated");
process.exit(failures ? 1 : 0);
