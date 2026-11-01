import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { pixelateCharacter } from "../lib/server/character";
import { errorResponse } from "../lib/server/errors";
import { MAX_REQUEST_BYTES, readPhotoForm, sanitizePhoto, validateKind, validateSessionId } from "../lib/server/photos";
import { localAssetPath } from "../lib/server/storage";

const sessionId = "a1b2c3d4-1234-4321-8123-a1b2c3d4e5f6";

test("session IDs and kinds cannot escape their storage namespace", () => {
  assert.equal(validateSessionId(sessionId.toUpperCase()), sessionId);
  for (const value of [null, "demo", "../../secrets", "a1b2c3d4-1234-1321-8123-a1b2c3d4e5f6"]) {
    assert.throws(() => validateSessionId(value));
  }
  assert.equal(validateKind("fit_back"), "fit_back");
  assert.throws(() => validateKind("../fit"));
});

test("local asset reader accepts only generated PNG paths", () => {
  const filename = "player-a1b2c3d4-1234-4321-8123-a1b2c3d4e5f6.png";
  assert.ok(localAssetPath(["uploads", sessionId, filename]).endsWith(filename));
  for (const segments of [
    ["uploads", sessionId, "../../../.env"],
    ["uploads", "..", filename],
    ["days", sessionId, filename],
    ["uploads", sessionId, filename, ".env"],
    ["uploads", sessionId, "%2e%2e%2f.env"],
  ]) assert.throws(() => localAssetPath(segments));
});

test("photo processing auto-orients and removes EXIF and colour metadata", async () => {
  const source = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const result = await sanitizePhoto(new File([new Uint8Array(source)], "photo.jpg", { type: "image/jpeg" }));
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 30);
  assert.equal(metadata.height, 20);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.format, "png");
});

test("photo processing rejects unsupported, corrupt, and oversized decoded images", async () => {
  await assert.rejects(sanitizePhoto(new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" })));
  await assert.rejects(sanitizePhoto(new File(["not an image"], "photo.jpg", { type: "image/jpeg" })));
  await assert.rejects(sanitizePhoto(null));
  // The compressed input is tiny, while decoding would exceed the 20MP limit.
  const large = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(sanitizePhoto(new File([new Uint8Array(large)], "large.png", { type: "image/png" })));
});

test("multipart reader bounds bodies even when Content-Length is omitted", async () => {
  const declared = new Request("http://localhost/api/upload", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(MAX_REQUEST_BYTES + 1) }, body: "x",
  });
  await assert.rejects(readPhotoForm(declared), /less than 4 MB/);
  const undeclared = new Request("http://localhost/api/upload", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: new Uint8Array(MAX_REQUEST_BYTES + 1),
  });
  await assert.rejects(readPhotoForm(undeclared), /less than 4 MB/);
  const form = new FormData();
  form.set("sessionId", sessionId);
  const parsed = await readPhotoForm(new Request("http://localhost/api/upload", { method: "POST", body: form }));
  assert.equal(parsed.get("sessionId"), sessionId);
});

test("character processing produces 32×48 PNG with binary alpha and ≤32 colours", async () => {
  const source = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#00000000" } })
    .composite([{ input: await sharp({ create: { width: 20, height: 40, channels: 4, background: { r: 220, g: 50, b: 70, alpha: 0.75 } } }).png().toBuffer(), left: 22, top: 12 }])
    .png().toBuffer();
  const result = await pixelateCharacter(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 48);
  assert.equal(metadata.format, "png");
  assert.equal(metadata.exif, undefined);
  const { data } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colours = new Set<string>();
  let transparent = 0;
  let visible = 0;
  let minX = 32;
  let maxX = -1;
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i + 3] === 0 || data[i + 3] === 255);
    colours.add(data.subarray(i, i + 4).toString("hex"));
    if (data[i + 3]) {
      visible++;
      minX = Math.min(minX, (i / 4) % 32);
      maxX = Math.max(maxX, (i / 4) % 32);
    } else transparent++;
  }
  assert.ok(colours.size <= 32);
  assert.ok(transparent > 0 && visible > 0);
  // A 20×40 subject becomes 24×48, centred without stretching to 32×48.
  assert.equal(maxX - minX + 1, 24);
  assert.equal(minX, 4);
});

test("character processing rejects opaque and empty image outputs", async () => {
  const opaque = await sharp({ create: { width: 32, height: 48, channels: 4, background: "red" } }).png().toBuffer();
  const empty = await sharp({ create: { width: 32, height: 48, channels: 4, background: "#00000000" } }).png().toBuffer();
  await assert.rejects(pixelateCharacter(opaque), /transparent background/);
  await assert.rejects(pixelateCharacter(empty), /transparent background/);
});

test("unhandled errors do not expose provider details or credentials", async () => {
  const response = errorResponse(new Error("private provider body: API key and photo"));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /API key|photo|provider/);
});

test("missing image credentials return an actionable error before contacting a provider", async () => {
  // Temporarily remove only the configuration presence. Never read key values.
  // Run in a subprocess rather than changing configuration in the shared test process.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "-e",
    "const { generateCharacter } = require('./lib/server/character.ts'); delete process.env.OPENAI_API_KEY; generateCharacter(Buffer.from('x')).then(() => { process.exitCode = 1; }, (e) => { if (e.status !== 503 || !e.message.includes('OPENAI_API_KEY')) process.exitCode = 1; });",
  ], { cwd: process.cwd() });
  assert.equal(result.stderr, "");
});
