import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAP_H, MAP_W, carveRoute, groundBlocked, placeLandmark } from "../game/maps";
import type { DayManifest } from "../lib/day";

const manifest = JSON.parse(readFileSync("public/days/demo/day.json", "utf8")) as DayManifest;

/** Same blocking rules as HighlightScene, then a flood fill from spawn. */
function reachable(scene: DayManifest["scenes"][number], exit = scene.exit) {
  const landmark = new Set<string>();
  for (const l of scene.landmarks) {
    const p = placeLandmark(scene.base, l);
    for (let y = p.y0 + p.h - 2; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) landmark.add(`${x},${y}`);
  }
  if (scene.food) landmark.add(`${scene.food.tile.x},${scene.food.tile.y}`);
  const carved = carveRoute(scene.base, scene.spawn, exit, landmark);
  const blocked = (x: number, y: number) => landmark.has(`${x},${y}`) || (groundBlocked(scene.base, x, y) && !carved.has(`${x},${y}`));
  const seen = new Set([`${scene.spawn.x},${scene.spawn.y}`]);
  const queue = [scene.spawn];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && !seen.has(k) && !blocked(nx, ny)) { seen.add(k); queue.push({ x: nx, y: ny }); }
    }
  }
  return seen.has(`${exit.x},${exit.y}`);
}

test("every scene's exit is reachable from spawn for the committed demo manifest", () => {
  for (const scene of manifest.scenes) assert.ok(reachable(scene), `${scene.kind}: exit ${JSON.stringify(scene.exit)} unreachable`);
});

test("exits anywhere on the right edge stay reachable", () => {
  for (const scene of manifest.scenes) for (const y of [1, 4, 7, 11, 13]) assert.ok(reachable(scene, { x: 19, y }), `${scene.kind}: (19,${y})`);
});
