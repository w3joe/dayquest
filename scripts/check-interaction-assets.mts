/** Validate the fixed asset library locally. Never generates or downloads artwork. */
import assert from "node:assert/strict";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseInteractionCatalog } from "../lib/interactions";

const catalog = parseInteractionCatalog(JSON.parse(await readFile(path.join(process.cwd(), "data", "interaction-catalog.json"), "utf8")));
const publicDirectory = await realpath(path.join(process.cwd(), "public"));
for (const asset of catalog.assets) {
  assert.ok(asset.src.startsWith("/interactions/library/") && !/[?#]/.test(asset.src), `${asset.id}: use a local /interactions/library/ PNG path`);
  const filename = await realpath(path.join(publicDirectory, decodeURIComponent(asset.src)));
  assert.ok(filename.startsWith(`${publicDirectory}${path.sep}`), `${asset.id}: asset must stay inside public/`);
  assert.ok((await stat(filename)).size <= 16 * 1024 * 1024, `${asset.id}: PNG exceeds 16 MB`);
  const source = sharp(filename, { limitInputPixels: 16 * 1024 * 1024 });
  const metadata = await source.metadata();
  assert.equal(metadata.format, "png", `${asset.id}: supply a PNG`);
  assert.equal(metadata.width, asset.width * (asset.frames ?? 1), `${asset.id}: strip width must equal width × frames`);
  assert.equal(metadata.height, asset.height, `${asset.id}: strip height must equal height`);
  assert.equal(metadata.hasAlpha, true, `${asset.id}: supply a transparent PNG`);
  const stats = await source.ensureAlpha().stats();
  assert.ok(stats.channels[3].max > 0 && stats.channels[3].min < 255, `${asset.id}: PNG needs visible content and transparent space`);
}
console.log(`Interaction catalogue verified locally (${catalog.assets.length} assets; no API calls).`);
