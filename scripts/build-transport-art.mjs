import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

// Final generated PNGs are committed. Builds validate them locally; they never
// regenerate art, require API keys, or depend on the original ImageGen output.
const spec = JSON.parse(await readFile(new URL("./transport-art-prompts.json", import.meta.url), "utf8"));
for (const [name, asset] of Object.entries(spec.assets)) {
  const filename = new URL(`../${asset.output}`, import.meta.url);
  const source = sharp(await readFile(filename));
  const metadata = await source.metadata();
  assert.equal(metadata.format, "png", `${name} must be PNG`);
  assert.equal(metadata.width, asset.width, `${name} width`);
  assert.equal(metadata.height, asset.height, `${name} height`);
  assert.equal(metadata.hasAlpha, true, `${name} needs transparency`);
  const { data } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  const colours = new Set();
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i + 3] === 0 || data[i + 3] === 255, `${name} alpha must be binary`);
    if (data[i + 3]) visible++;
    colours.add(data.subarray(i, i + 4).toString("hex"));
  }
  assert.ok(visible > 0 && visible < asset.width * asset.height, `${name} must have content and transparent space`);
  assert.ok(colours.size <= 32, `${name} must retain the game palette`);
  assert.ok(asset.entry.x >= 0 && asset.entry.x < asset.width && asset.entry.y >= 0 && asset.entry.y < asset.height, `${name} entry anchor`);
}
console.log("Reusable transport sprites verified locally (no API calls).");
