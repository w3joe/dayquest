import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

// Deliberately exercises the running app, OpenAI and public Blob storage.
// No provider stand-ins, cookies or credentials are sent by this client.
const { values } = parseArgs({ options: {
  front: { type: "string" }, back: { type: "string" },
  "base-url": { type: "string", default: "http://localhost:3000" },
  help: { type: "boolean" },
} });

if (values.help || !values.front) {
  console.log('Usage: npm run prove:fit-check -- --front /path/front.jpg [--back /path/back.jpg] [--base-url https://your-app.vercel.app]');
  console.log("Makes one paid image-generation request after proving photo storage. Evidence stays in ignored .data/.");
  process.exit(values.help ? 0 : 1);
}

const base = new URL(values["base-url"]);
assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "Use an HTTP(S) app URL without credentials.");
const sessionId = randomUUID();
const output = path.join(".data", "fit-check-proof", sessionId);
const report = {
  startedAt: new Date().toISOString(), baseUrl: base.origin, sessionId,
  status: "running", uploads: [],
  visualReview: { backFacing: "pending", outfitPreserved: "pending" },
};

async function photo(filename) {
  const bytes = await readFile(filename);
  const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
  const type = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[metadata.format];
  assert.ok(type && (metadata.pages ?? 1) === 1, "Use a still JPEG, PNG or WebP.");
  assert.ok(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, "Each photo must be under 4 MB.");
  return new File([bytes], path.basename(filename), { type });
}

async function post(route, form, field) {
  const response = await fetch(new URL(route, base), {
    method: "POST", body: form, credentials: "omit", signal: AbortSignal.timeout(150_000),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`${route}: HTTP ${response.status}, expected JSON. Check the app URL and deployment access.`); }
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${result.error || "Request failed"}`);
  assert.equal(typeof result[field], "string", `${route} did not return ${field}.`);
  const url = new URL(result[field], base);
  assert.ok(url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com"),
    "Asset is not in public Vercel Blob storage. Set BLOB_READ_WRITE_TOKEN on the running server; local fallback does not pass this check.");
  assert.ok(!url.search && !url.username && !url.password, "The shared asset must work without a signed URL or credentials.");
  return url.href;
}

async function download(url) {
  const response = await fetch(url, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, "Anonymous asset download failed.");
  assert.equal(response.headers.get("content-type")?.split(";")[0], "image/png");
  return Buffer.from(await response.arrayBuffer());
}

async function run() {
  const front = await photo(values.front);
  const back = values.back ? await photo(values.back) : undefined;
  assert.ok(front.size + (back?.size ?? 0) <= 4 * 1024 * 1024, "Front and back photos must total under 4 MB.");
  await mkdir(output, { recursive: true, mode: 0o700 });
  for (const [kind, file] of [["fit", front], ["fit_back", back]]) {
    if (!file) continue;
    console.log(`Uploading ${kind} through /api/upload…`);
    const form = new FormData();
    form.set("photo", file); form.set("kind", kind); form.set("sessionId", sessionId);
    const url = await post("/api/upload", form, "url");
    const bytes = await download(url);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "png");
    assert.ok(!metadata.exif && !metadata.icc && !metadata.xmp, "Stored photo must have metadata removed.");
    assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
    await writeFile(path.join(output, `${kind}.png`), bytes, { mode: 0o600 });
    report.uploads.push({ kind, url, bytes: bytes.length, metadataStripped: true, anonymousDownload: true });
  }
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log("Photo is stored in public Blob. Generating the sprite through /api/fit-check…");
  const form = new FormData();
  form.set("photo", front); form.set("sessionId", sessionId);
  if (back) form.set("backPhoto", back);
  const started = Date.now();
  const spriteUrl = await post("/api/fit-check", form, "spriteUrl");
  const bytes = await download(spriteUrl);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 32); assert.equal(metadata.height, 48);
  assert.ok(metadata.hasAlpha, "Sprite has no alpha channel.");
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colours = new Set();
  let transparentPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i + 3] === 0 || data[i + 3] === 255, "Sprite alpha is not binary.");
    if (data[i + 3] === 0) transparentPixels++;
    colours.add(data.subarray(i, i + 4).toString("hex"));
  }
  assert.ok(transparentPixels > 0 && transparentPixels < 32 * 48, "Sprite is opaque or empty.");
  assert.ok(colours.size <= 32, "Sprite exceeds 32 colours.");
  const digest = data => createHash("sha256").update(data).digest("hex");
  assert.equal(digest(await download(spriteUrl)), digest(bytes), "Second anonymous download returned different bytes.");
  await writeFile(path.join(output, "player.png"), bytes, { mode: 0o600 });
  report.sprite = { url: spriteUrl, width: 32, height: 48, colours: colours.size, transparentPixels,
    binaryAlpha: true, sha256: digest(bytes), anonymousDownload: true, elapsedMs: Date.now() - started };
  report.status = "api-and-storage-passed; visual-review-pending";
  console.log(`API/storage checks passed. Review ${output}/fit.png and player.png for back view and outfit fidelity.`);
}

try { await run(); }
catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "Live check failed.";
  console.error(report.error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Evidence: ${output}/report.json`);
}
