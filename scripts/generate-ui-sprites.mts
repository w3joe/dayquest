// One-off: generate the UI sprites in public/ui with the OpenAI image model.
// Usage: node --env-file=.env --import tsx scripts/generate-ui-sprites.mts [name ...]
import { mkdir, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import sharp from "sharp";

const STYLE = "Cute 8-bit retro pixel art sprite icon, chunky visible square pixels, soft pastel palette (pink, peach, butter yellow, mint, sky blue, lavender, cream) with a dark plum outline, gentle shading, kawaii and cozy. ONE single centred object, whole object visible with generous margin, fully transparent background, no text, no ground shadow.";
const SPRITES: Record<string, string> = {
  shirt: "A folded pastel sky-blue t-shirt.",
  food: "A steaming ramen bowl with noodles, a soft egg and a pink naruto swirl, viewed from slightly above.",
  landmark: "A cute simplified Big Ben style clock tower landmark with a golden spire and a clock face.",
  face: "A friendly human face portrait, head and neck only, neutral smile, simple dark hair, rosy cheeks, front view, gender neutral, chibi proportions.",
  cat: "A round cream-and-peach cat face with pink inner ears, rosy cheeks and a tiny smile.",
  cloud: "A fluffy white cloud with a soft blue underside.",
  flower: "A small pink flower with a yellow centre and a green stem with two leaves.",
  heart: "A glossy pastel pink heart.",
  star: "A pastel butter-yellow five point star with a tiny white highlight.",
};

const client = new OpenAI({ timeout: 180_000, maxRetries: 1 });
const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPRITES);
await mkdir("public/ui", { recursive: true });

await Promise.all(names.map(async name => {
  const result = await client.images.generate({ model, prompt: `${STYLE} ${SPRITES[name]}`, background: "transparent", output_format: "png", size: "1024x1024", quality: "medium", n: 1 });
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${name}: no image returned`);
  const raw = Buffer.from(encoded, "base64");
  const trimmed = await sharp(raw).ensureAlpha().trim({ background: "#00000000", threshold: 1 }).png().toBuffer();
  const out = await sharp(trimmed).resize(64, 64, { fit: "contain", background: "#00000000", kernel: "mitchell" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = out.data[i] < 110 ? 0 : 255;
  await writeFile(`public/ui/${name}.png`, await sharp(out.data, { raw: { width: 64, height: 64, channels: 4 } }).png({ palette: true, colours: 24, dither: 0 }).toBuffer());
  console.log("ok", name);
}));
