// Renders the whole world of public/days/<id>/day.json to one PNG, for checking a layout by eye without a browser.
//   npx tsx scripts/render-world.mts [id] [out.png]
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const id = process.argv[2] || "world-preview", out = process.argv[3] || `/tmp/${id}.png`;
const root = path.join(process.cwd(), "public"), dayDir = path.join(root, "days", id);
const manifest = JSON.parse(await readFile(path.join(dayDir, "day.json"), "utf8"));
const world = manifest.scenes[0].world, T = 16;
const material: Record<string, string> = { g: "grass", f: "flowers", p: "pavement", c: "cobble", r: "road", k: "kerb" };
const layers: sharp.OverlayOptions[] = [];
const tiles = new Map<string, Buffer>();
for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
  const c = world.ground[y][x];
  const input = c === "w" ? await sharp({ create: { width: T, height: T, channels: 4, background: "#568fa4" } }).png().toBuffer()
    : tiles.get(c) ?? (tiles.set(c, await sharp(path.join(root, "tiles/dq/library", `${material[c]}.png`)).resize(T, T, { kernel: "nearest" }).toBuffer()), tiles.get(c)!);
  layers.push({ input, left: x * T, top: y * T });
}
for (const o of [...world.objects].sort((a: { y: number }, b: { y: number }) => a.y - b.y)) {
  const file = o.sprite.startsWith("/") ? path.join(root, o.sprite) : path.join(dayDir, o.sprite);
  try { layers.push({ input: await sharp(file).resize(o.width, o.height, { kernel: "nearest" }).toBuffer(), left: Math.round(o.x - o.width / 2), top: Math.round(o.y - o.height) }); } catch { /* sprite missing: skip */ }
}
const spawn = manifest.scenes[0].spawn, exit = manifest.scenes[0].exit;
const mark = (t: { x: number; y: number }, colour: string) => sharp({ create: { width: 10, height: 10, channels: 4, background: colour } }).png().toBuffer();
layers.push({ input: await mark(spawn, "#2a7fff"), left: spawn.x * T + 3, top: spawn.y * T + 3 }, { input: await mark(exit, "#ff3b3b"), left: exit.x * T + 3, top: exit.y * T + 3 });
const flat = await sharp({ create: { width: world.width * T, height: world.height * T, channels: 4, background: "#000" } }).composite(layers).png().toBuffer();
await sharp(flat).resize(world.width * T * 2, world.height * T * 2, { kernel: "nearest" }).png().toFile(out);
console.log("wrote", out);
