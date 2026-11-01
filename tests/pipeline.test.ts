import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { parseDayManifest } from "../lib/day";
import { runGenerateDay } from "../pipeline/generate";
import { normalizePlan, templatePlan } from "../pipeline/highlights";
import { mapLimit, mockImageGenerator, type ImageGenerator } from "../pipeline/imagegen";
import { buildTransit } from "../pipeline/layout";
import { pixelate, TARGETS } from "../pipeline/pixelate";
import type { DayStore } from "../pipeline/publish";
import { fetchWikipediaImage } from "../pipeline/references";
import type { DayInput, GenerateEvent } from "../pipeline/types";

const input = async () => JSON.parse(await readFile("data/input.json", "utf8")) as DayInput;

function memoryStore() {
  const files = new Map<string, Buffer>();
  const store: DayStore = { manifestUrl: "/days/t/day.json", async put(name, bytes) { files.set(name, bytes); } };
  return { files, store };
}

test("pixelate hits every fixed target size with binary alpha and ≤32 colours", async () => {
  const raw = await mockImageGenerator().generate({ kind: "landmark", name: "Big Ben", prompt: "", references: [] });
  for (const [target, { width, height }] of Object.entries(TARGETS)) {
    const png = await pixelate(raw, target as keyof typeof TARGETS);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [width, height], target);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      assert.ok(data[i + 3] === 0 || data[i + 3] === 255);
      if (data[i + 3]) colours.add(data.readUInt32BE(i));
    }
    assert.ok(colours.size > 0 && colours.size <= 32, `${target}: ${colours.size} colours`);
  }
});

test("normalizePlan fixes kind order, base maps and slots, and requires the meal's food", async () => {
  const plan = templatePlan(await input());
  const shuffled = { scenes: [plan.scenes[2], plan.scenes[0], { ...plan.scenes[1], food: { name: "ramen", text: "Had ramen." } }] };
  const fixed = normalizePlan(shuffled);
  assert.deepEqual(fixed.scenes.map((s) => [s.kind, s.base]), [["tourist", "city"], ["meal", "street"], ["park", "park"]]);
  assert.deepEqual(fixed.scenes[0].landmarks.map((l) => l.slot), [0, 1, 2]);
  assert.throws(() => normalizePlan({ scenes: [plan.scenes[0], { ...plan.scenes[1], food: null }, plan.scenes[2]] }));
  assert.throws(() => normalizePlan({ scenes: [plan.scenes[0]] }));
});

test("transport becomes exactly two transitions: bus 24, then Central → Bakerloo", async () => {
  const transit = buildTransit((await input()).transport);
  assert.equal(transit.length, 2);
  assert.equal(transit[0].legs[0].mode, "bus");
  assert.deepEqual(transit[1].legs.map((l) => l.mode === "tube" && l.color), ["#E32017", "#B36305"]);
});

test("mock pipeline publishes a valid manifest, every referenced sprite, and the §6.1 events", async () => {
  const { files, store } = memoryStore();
  const events: GenerateEvent[] = [];
  const manifest = await runGenerateDay({ id: "t", input: await input(), store, livePlan: false, images: mockImageGenerator() }, (e) => events.push(e));
  const saved = parseDayManifest(JSON.parse(files.get("day.json")!.toString()), "t");
  assert.deepEqual(saved, manifest);
  const sprites = [saved.player.sprite, ...saved.scenes.flatMap((s) => [...s.landmarks.map((l) => l.sprite), ...(s.food ? [s.food.sprite, s.food.icon!] : [])])];
  for (const sprite of sprites) assert.ok(files.has(sprite), sprite);
  assert.deepEqual([...new Set(events.map((e) => e.step))], ["highlights", "landmarks", "image", "pixelate", "done"]);
  assert.equal(events.at(-1)?.id, "t");
  assert.ok(events.filter((e) => e.step === "image").every((e) => e.thumb?.startsWith("data:image/png;base64,")));
});

test("a failing image model falls back to placeholders instead of failing the day", async () => {
  const { files, store } = memoryStore();
  const broken: ImageGenerator = { live: true, generate: async () => { throw new Error("rate limited"); } };
  const events: GenerateEvent[] = [];
  await runGenerateDay({ id: "t", input: await input(), store, livePlan: false, images: broken }, (e) => events.push(e));
  assert.ok(files.has("day.json"));
  assert.ok(events.some((e) => e.label.includes("PLACEHOLDER")));
});

test("Wikipedia references only follow upload.wikimedia.org and never throw", async () => {
  const fake = (async (url: string) => {
    if (String(url).includes("/page/summary/")) return Response.json({ originalimage: { source: "https://evil.example/x.png" } });
    throw new Error("should not fetch");
  }) as typeof fetch;
  assert.equal(await fetchWikipediaImage("Big Ben", fake), null);
  assert.equal(await fetchWikipediaImage("Big Ben", (async () => { throw new Error("offline"); }) as typeof fetch), null);
  assert.equal(await fetchWikipediaImage(""), null);
});

test("mapLimit keeps order and never exceeds the concurrency cap", async () => {
  let active = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.equal(peak, 3);
});
