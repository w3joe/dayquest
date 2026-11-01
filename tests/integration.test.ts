import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BASE_LAYOUT, groundBlocked, MAP_H, MAP_W, placeLandmark } from "../game/maps";
import { parseDayManifest, type DayScene } from "../lib/day";
import { templatePlan } from "../pipeline/highlights";
import type { DayInput } from "../pipeline/types";

const adjacent = (x: number, y: number) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];

test("demo and pipeline maps have reachable exits, landmarks and food", async () => {
  const demo = parseDayManifest(JSON.parse(await readFile("public/days/demo/day.json", "utf8")), "demo");
  const input = JSON.parse(await readFile("data/input.json", "utf8")) as DayInput;
  const planned = templatePlan(input).scenes.map(scene => ({
    ...scene, ...BASE_LAYOUT[scene.base],
    landmarks: scene.landmarks.map(landmark => ({ ...landmark, sprite: "test.png" })),
    food: scene.food ? { ...scene.food, sprite: "food.png", tile: BASE_LAYOUT[scene.base].food! } : undefined,
  })) as DayScene[];
  for (const scene of [...demo.scenes, ...planned]) {
    const blocked = new Set<string>();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (groundBlocked(scene.base, x, y)) blocked.add(`${x},${y}`);
    }
    const targets = scene.landmarks.map(landmark => {
      const p = placeLandmark(scene.base, landmark);
      const tiles: number[][] = [];
      for (let y = p.y0 + p.h - 2; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) {
        blocked.add(`${x},${y}`); tiles.push([x, y]);
      }
      return { name: landmark.name, tiles };
    });
    if (scene.food) {
      const { x, y } = scene.food.tile;
      blocked.add(`${x},${y}`); targets.push({ name: "food", tiles: [[x, y]] });
    }
    const reachable = new Set<string>();
    const queue = [[scene.spawn.x, scene.spawn.y]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]; const key = `${x},${y}`;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H || blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key); queue.push(...adjacent(x, y));
    }
    assert.ok(reachable.has(`${scene.exit.x},${scene.exit.y}`), `${scene.kind}: unreachable exit`);
    for (const target of targets) assert.ok(target.tiles.some(([x, y]) => adjacent(x, y).some(([a, b]) => reachable.has(`${a},${b}`))), `${scene.kind}: unreachable ${target.name}`);
  }
});

test("generation rejects a missing sprite and publishes the supplied sprite unchanged", async () => {
  // Explicit local fixture mode: no OpenAI requests and no public Blob writes.
  const envKeys = ["NODE_ENV", "BLOB_READ_WRITE_TOKEN", "BLOB_BASE_URL", "PIPELINE_TEXT", "PIPELINE_IMAGES"];
  const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "development", BLOB_READ_WRITE_TOKEN: "", BLOB_BASE_URL: "", PIPELINE_TEXT: "mock", PIPELINE_IMAGES: "mock" });
  const sessionId = randomUUID();
  const dir = path.join(".data", "assets", "uploads", sessionId);
  let generatedId: string | undefined;
  try {
    const { POST } = await import("../app/api/generate-day/route");
    assert.equal((await POST(new Request("http://localhost/api/generate-day", { method: "POST", body: "{}" }))).status, 400);
    await mkdir(dir, { recursive: true });
    const sprite = await readFile("public/days/demo/player.png");
    const { writeFile } = await import("node:fs/promises");
    const fitFile = `fit-${randomUUID()}.png`;
    const playerFile = `player-${randomUUID()}.png`;
    await writeFile(path.join(dir, fitFile), sprite);
    const prefix = `/api/assets/uploads/${sessionId}/`;
    const draft = { sessionId, uploads: [{ kind: "fit", url: prefix + fitFile }], spriteUrl: prefix + playerFile };
    const request = () => new Request("http://localhost/api/generate-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    assert.equal((await POST(request())).status, 422);
    await writeFile(path.join(dir, playerFile), sprite);
    const response = await POST(request());
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    generatedId = events.at(-1)?.id;
    assert.equal(events.at(-1)?.step, "done");
    assert.ok(generatedId);
    assert.deepEqual(await readFile(path.join("public", "days", generatedId, "player.png")), sprite);
    parseDayManifest(JSON.parse(await readFile(path.join("public", "days", generatedId, "day.json"), "utf8")), generatedId);
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (generatedId) await rm(path.join("public", "days", generatedId), { recursive: true, force: true });
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
