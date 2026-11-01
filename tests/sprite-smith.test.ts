import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { checkSpritePng, smithSprite, smithSprites, type SpriteRequest } from "../pipeline/sprite-smith";
import type { AgentRunner } from "../pipeline/world-director";
import type { ImageGenerator, ImageRequest } from "../pipeline/imagegen";

const goodPng = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="128" y="96" width="256" height="320" rx="60" fill="#c0603a" stroke="#401810" stroke-width="16"/></svg>`)).png().toBuffer();
const opaquePng = () => sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 90, g: 160, b: 90, alpha: 1 } } }).png().toBuffer();

const req = (id: string, extra: Partial<SpriteRequest> = {}): SpriteRequest => ({ id, name: id, description: "a small bakery cart", role: "prop", width: 32, height: 32,
  context: { sceneTitle: "Morning", locationName: "Market", season: "autumn" }, ...extra });

function fakeRunner() {
  const calls: { input: { request: SpriteRequest; previousProblems: string[] } }[] = [];
  let n = 0;
  const runner: AgentRunner = async (c) => { calls.push({ input: JSON.parse(c.input) }); return { prompt: `prompt-${++n}`, notes: "n" }; };
  return { runner, calls };
}
function fakeGen(images: (() => Promise<Buffer>)[], onCall?: (r: ImageRequest) => Promise<void>): ImageGenerator & { requests: ImageRequest[] } {
  const requests: ImageRequest[] = []; let i = 0;
  return { live: false, requests, async generate(r) { requests.push(r); await onCall?.(r); return images[Math.min(i++, images.length - 1)](); } };
}

test("good sprite passes and is exactly sized", async () => {
  const { runner } = fakeRunner();
  const gen = fakeGen([goodPng]);
  const r = await smithSprite(req("a"), { runner, generator: gen, references: [] });
  assert.equal(r.attempts, 1);
  const m = await sharp(r.png).metadata();
  assert.equal(m.width, 32); assert.equal(m.height, 32);
  assert.equal((await checkSpritePng(r.png, 32, 32)).ok, true);
});

test("prompt text reaches the generator", async () => {
  const { runner } = fakeRunner();
  const gen = fakeGen([goodPng]);
  const r = await smithSprite(req("a"), { runner, generator: gen, references: [Buffer.from("x")] });
  assert.equal(gen.requests[0].prompt, "prompt-1");
  assert.equal(r.prompt, "prompt-1");
  assert.equal(gen.requests[0].references.length, 1);
});

test("bad then good retries with previousProblems", async () => {
  const { runner, calls } = fakeRunner();
  const gen = fakeGen([opaquePng, goodPng]);
  const r = await smithSprite(req("a"), { runner, generator: gen, references: [] });
  assert.equal(r.attempts, 2);
  assert.deepEqual(calls[0].input.previousProblems, []);
  assert.ok(calls[1].input.previousProblems.length > 0);
  assert.match(calls[1].input.previousProblems.join(" "), /background|border|covers/);
});

test("two bad images throw naming the id", async () => {
  const { runner } = fakeRunner();
  await assert.rejects(smithSprite(req("sprite-xyz"), { runner, generator: fakeGen([opaquePng]), references: [] }), /sprite-xyz/);
});

test("generator errors count as failed attempts with short messages", async () => {
  const { runner } = fakeRunner();
  const gen: ImageGenerator = { live: false, async generate() { throw new Error("x".repeat(5000)); } };
  await assert.rejects(smithSprite(req("e1"), { runner, generator: gen, references: [] }), (e: Error) => e.message.includes("e1") && e.message.length < 500);
});

test("smithSprites reports made and failed without throwing, in order", async () => {
  const { runner } = fakeRunner();
  const gen: ImageGenerator = { live: false, async generate(r) { return r.name === "bad" ? opaquePng() : goodPng(); } };
  const out = await smithSprites([req("ok1"), req("bad"), req("ok2")], { runner, generator: gen, references: [] });
  assert.deepEqual(out.made.map((m) => m.id), ["ok1", "ok2"]);
  assert.equal(out.failed.length, 1);
  assert.equal(out.failed[0].id, "bad");
});

test("concurrency is bounded", async () => {
  const { runner } = fakeRunner();
  let inflight = 0, peak = 0;
  const gen = fakeGen([goodPng], async () => { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 15)); inflight--; });
  const reqs = Array.from({ length: 10 }, (_, i) => req(`s${i}`));
  const out = await smithSprites(reqs, { runner, generator: gen, references: [] }, 2);
  assert.equal(out.made.length, 10);
  assert.ok(peak <= 2 && peak >= 1, `peak ${peak}`);
  inflight = 0; peak = 0;
  await smithSprites(reqs, { runner, generator: gen, references: [] }, 99);
  assert.ok(peak <= 4, `peak ${peak}`);
});

test("checkSpritePng flags problems", async () => {
  const good = await sharp(await goodPng()).resize(32, 32).png().toBuffer();
  assert.equal((await checkSpritePng(good, 32, 32)).ok, true);
  assert.match((await checkSpritePng(good, 16, 16)).problems.join(" "), /dimensions/);
  const full = await opaquePng();
  const f = await checkSpritePng(full, 512, 512);
  assert.equal(f.ok, false);
  assert.match(f.problems.join(" "), /border/);
  assert.match(f.problems.join(" "), /covers/);
  const empty = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  assert.match((await checkSpritePng(empty, 32, 32)).problems.join(" "), /empty/);
  const noise = Buffer.alloc(64 * 64 * 4, 0);
  for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) {
    const i = (y * 64 + x) * 4;
    noise[i] = (x * 37 + y * 11) % 256; noise[i + 1] = (x * 73 + y * 29) % 256; noise[i + 2] = (x * 5 + y * 101) % 256; noise[i + 3] = 255;
  }
  const png = await sharp(noise, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  assert.match((await checkSpritePng(png, 64, 64)).problems.join(" "), /too many colours/);
  const rgb = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
  assert.match((await checkSpritePng(rgb, 8, 8)).problems.join(" "), /alpha/);
});
