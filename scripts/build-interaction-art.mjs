/** Copy supplied art or crop its existing cells. No generation, downloads or repainting. */
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(root, "data", "interaction-catalog.json"), "utf8"));
const demoCatalog = JSON.parse(await readFile(path.join(root, "data", "demo-interaction-catalog.json"), "utf8"));
const sources = JSON.parse(await readFile(new URL("./interaction-art-sources.json", import.meta.url), "utf8"));
assert.equal(sources.version, 1, "Unknown interaction art source format");
const sourceRoot = await realpath(path.join(root, "london-25d", "assets"));
const staged = new Set();
for (const item of sources.sources) {
  assert.ok(!staged.has(item.assetId), `Duplicate staged asset ${item.assetId}`);
  assert.ok(item.catalog === undefined || item.catalog === "demo", `${item.assetId} has an unsupported catalogue scope`);
  const selectedCatalog = item.catalog === "demo" ? demoCatalog : catalog;
  const asset = selectedCatalog.assets.find(candidate => candidate.id === item.assetId);
  assert.ok(asset, `${item.assetId} must be registered in the fixed catalogue`);
  assert.match(asset.src, /^\/interactions\/library\/[A-Za-z0-9_-]+\.png$/, `${item.assetId} must have a fixed local PNG filename`);
  const filename = await realpath(path.resolve(root, item.source));
  assert.ok(filename.startsWith(`${sourceRoot}${path.sep}`), `${item.assetId} source must be supplied London artwork`);
  const original = sharp(filename, { limitInputPixels: 16 * 1024 * 1024 });
  // Cropping retains the supplied 32×48 cell grid. No resizing, repainting or
  // character substitution: these strips are solely for the matching demo actor.
  const cropped = item.extract ? await original.extract(item.extract).png().toBuffer() : undefined;
  const image = cropped ? sharp(cropped) : original;
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png", `${item.assetId} must be a PNG`);
  assert.equal(metadata.width, asset.width * (asset.frames ?? 1), `${item.assetId} source strip width`);
  assert.equal(metadata.height, asset.height, `${item.assetId} source height`);
  assert.equal(metadata.hasAlpha, true, `${item.assetId} source transparency`);
  const stats = await image.ensureAlpha().stats();
  assert.ok(stats.channels[3].min < 255 && stats.channels[3].max > 0, `${item.assetId} needs visible content and transparent space`);
  const output = path.join(root, "public", asset.src);
  await mkdir(path.dirname(output), { recursive: true });
  if (cropped) await writeFile(output, cropped);
  else await copyFile(filename, output);
  staged.add(item.assetId);
}
console.log(`Staged ${staged.size} supplied interaction sprites locally (no API calls).`);
