// Generates the ground tiles with the OpenAI image API, then makes each seamless and pixelates it to 16x16.
// Usage: node scripts/generate-tiles.mjs [name ...]   (no names = all). Needs OPENAI_API_KEY (reads .env).
import { mkdir, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import sharp from "sharp";

try { process.loadEnvFile(".env"); } catch { /* env may already be set */ }
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
const OUT = "public/tiles/dq";
const STYLE = "Nintendo DS era JRPG overworld pixel art, top-down 3/4 view, soft shading, vibrant natural palette, clean pixel clusters, no outlines on ground textures, no text, no UI, no border.";

const TILES = {
  grass: "A perfectly seamless tileable texture of lush short grass with a few small lighter blades.",
  grass_flowers: "A perfectly seamless tileable texture of short grass dotted with a few tiny white and yellow flowers.",
  path: "A perfectly seamless tileable texture of a packed sandy-tan dirt path with subtle pebbles.",
  cobble: "A perfectly seamless tileable texture of grey-beige cobblestone street paving.",
  water: "A perfectly seamless tileable texture of calm blue river water with soft light ripples.",
  hedge: "A perfectly seamless tileable texture of a dense dark green trimmed hedge top.",
};
const OBJECTS = {
  tree: "A single round leafy green tree with a short brown trunk, isolated, centred, fully transparent background, no ground.",
};

const client = new OpenAI();
const want = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

async function generate(prompt, transparent) {
  const r = await client.images.generate({ model: MODEL, prompt: `${STYLE} ${prompt}`, size: "1024x1024", quality: "medium", output_format: "png", ...(transparent ? { background: "transparent" } : {}) });
  return Buffer.from(r.data[0].b64_json, "base64");
}

/** Cross-fade the image with a half-offset copy of itself so opposite edges match and the tile repeats without seams. */
async function makeSeamless(png, size = 256) {
  // A central 256px crop of the 1024px render keeps texture detail visible once it is shrunk to a 16px tile.
  const { data } = await sharp(png).extract({ left: 384, top: 384, width: size, height: size }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wx = 1 - Math.abs((2 * x) / size - 1), wy = 1 - Math.abs((2 * y) / size - 1); // 1 at centre, 0 at edges
    const w = Math.min(1, wx * 1.4) * Math.min(1, wy * 1.4);
    const sx = (x + size / 2) % size, sy = (y + size / 2) % size;
    for (let c = 0; c < 3; c++) out[(y * size + x) * 3 + c] = Math.round(data[(y * size + x) * 3 + c] * w + data[(sy * size + sx) * 3 + c] * (1 - w));
  }
  return sharp(out, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

const pixel = (buf, w, h) => sharp(buf).resize(w, h, { kernel: "lanczos3" }).png({ palette: true, colors: 24, dither: 0 }).toBuffer();

for (const [name, prompt] of Object.entries(TILES)) {
  if (want.length && !want.includes(name)) continue;
  console.log("generating", name);
  const raw = await generate(prompt, false);
  await writeFile(`${OUT}/${name}.raw.png`, raw);
  await writeFile(`${OUT}/${name}.png`, await pixel(await makeSeamless(raw), 16, 16));
}
for (const [name, prompt] of Object.entries(OBJECTS)) {
  if (want.length && !want.includes(name)) continue;
  console.log("generating", name);
  const raw = await generate(prompt, true);
  await writeFile(`${OUT}/${name}.raw.png`, raw);
  const trimmed = await sharp(raw).trim({ background: "#00000000", threshold: 1 }).toBuffer();
  const sized = await sharp(trimmed).resize(16, 24, { fit: "contain", background: "#00000000", kernel: "nearest" }).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < sized.data.length; i += 4) sized.data[i] = sized.data[i] < 128 ? 0 : 255;
  await writeFile(`${OUT}/${name}.png`, await sharp(sized.data, { raw: { width: 16, height: 24, channels: 4 } }).png({ palette: true, colors: 24, dither: 0 }).toBuffer());
}
console.log("done");
