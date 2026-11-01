/** Four sample worlds exercise bus, Tube change, walking and final sharing.
 * Existing local art only. No location service, API key or image generation needed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import example from "../data/transport-example.json";
import type { DayManifest, DayScene } from "../lib/day";
import type { JourneyConnection } from "../lib/itinerary";
import { buildWorldLayout } from "../game/world-layout";
import { mockScenePlan } from "../pipeline/scene-plan";
import { pixelateSceneSprite } from "../pipeline/pixelate";
import { composeWorldItinerary } from "../pipeline/compose-itinerary";

const directory = path.join(process.cwd(), "public", "days", example.id);
await mkdir(directory, { recursive: true });
const source = path.join(process.cwd(), "shadwell-25d", "assets");
const artwork = ["shop_corner", "shop_cafe", "yellow_house", "station", "flats", "shop_laundry"];
await Promise.all(artwork.map(async name => writeFile(path.join(directory, `${name}.png`),
  await pixelateSceneSprite(await readFile(path.join(source, `${name}.png`)), 160, 128))));
const sheet = await sharp(await readFile(path.join(source, "shawn.png"))).extract({ left: 0, top: 0, width: 96, height: 192 }).png().toBuffer();
await writeFile(path.join(directory, "player_walk.png"), sheet);
await writeFile(path.join(directory, "player.png"), await sharp(sheet).extract({ left: 0, top: 144, width: 32, height: 48 }).png().toBuffer());
await writeFile(path.join(directory, "food.png"), await readFile(path.join(process.cwd(), "public", "days", "demo", "s1_food_icon.png")));

const scenes: DayScene[] = example.locations.map((location, index) => {
  const blueprint = mockScenePlan(index === 1 ? { lunch: Buffer.from("offline fixture") } : {});
  blueprint.title = location.title;
  blueprint.ground = location.ground as typeof blueprint.ground;
  blueprint.buildings.forEach((building, i) => {
    building.name = `Sample building ${i + 1}`;
    building.description = `Sample artwork for ${location.title}. Walk to the marked departure point to continue your journey.`;
  });
  const sprites = Object.fromEntries(blueprint.buildings.map((building, i) => [building.id, `${artwork[(index + i) % artwork.length]}.png`]));
  const layout = buildWorldLayout(blueprint, sprites);
  return { id: location.id, title: location.title, time: location.time, kind: "tourist", base: location.ground === "park" ? "park" : "street",
    world: layout.world, spawn: layout.spawn, exit: layout.exit, landmarks: [],
    ...(index === 1 ? { food: { sprite: "food.png", icon: "food.png", tile: layout.foodTile,
      text: "Sample lunch. This transport preview uses existing artwork and fictional journey data." } } : {}) };
});
const manifest: DayManifest = composeWorldItinerary({ id: example.id, date: example.date,
  player: { name: "Transport preview", sprite: "player.png", walkSheet: "player_walk.png" },
  scenes, connections: example.connections as JourneyConnection[] });
await writeFile(path.join(directory, "day.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(directory, "PREVIEW.txt"), `${example.notice}\nExisting artwork only. No paid API calls.\n`);
console.log("Transport preview: http://127.0.0.1:3000/day/transport-preview");
