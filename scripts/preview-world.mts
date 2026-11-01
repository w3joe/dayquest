/** Offline renderer fixture only. This never contacts an image or text service. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { mockScenePlan } from "../pipeline/scene-plan";
import { pixelateSceneSprite } from "../pipeline/pixelate";
import { buildWorldLayout } from "../game/world-layout";
import { parseDayManifest, type DayManifest } from "../lib/day";

const id = "world-preview";
const root = process.cwd();
const destination = path.join(root, "public", "days", id);
const artwork = path.join(root, "shadwell-25d", "assets");
await mkdir(destination, { recursive: true });

const blueprint = mockScenePlan({ landmark: Buffer.from("offline fixture"), lunch: Buffer.from("offline fixture") });
blueprint.title = "World preview · sample artwork";
blueprint.locationName = "Offline sample street";
blueprint.description = "OFFLINE PREVIEW: existing Shadwell sample artwork, not generated from your photos.";
blueprint.buildings.forEach((building, index) => {
  building.name = `Sample building ${index + 1}`;
  building.description = "Offline fixture: existing Shadwell artwork. Your location photo will define the building in a generated day.";
  building.observed = false;
});
// Every fixture interaction explicitly describes its sample status.
blueprint.props.forEach((prop) => { prop.description = `Offline sample artwork: ${prop.description}`; });
if (blueprint.food) blueprint.food.text = "Offline sample lunch icon. This preview was built without analysing or generating from your photos.";

const sprites: Record<string, string> = {};
const buildings = ["shop_corner", "shop_cafe", "yellow_house"];
await Promise.all(blueprint.buildings.map(async (building, index) => {
  const filename = `${building.id}.png`;
  const bytes = await pixelateSceneSprite(await readFile(path.join(artwork, `${buildings[index]}.png`)), 160, 128);
  await writeFile(path.join(destination, filename), bytes);
  sprites[building.id] = filename;
}));

const originalSheet = await readFile(path.join(artwork, "shawn.png"));
const sheet = await sharp(originalSheet).extract({ left: 0, top: 0, width: 96, height: 192 }).png().toBuffer();
await writeFile(path.join(destination, "player_walk.png"), sheet);
await writeFile(path.join(destination, "player.png"), await sharp(sheet).extract({ left: 0, top: 144, width: 32, height: 48 }).png().toBuffer());
await writeFile(path.join(destination, "food.png"), await sharp(await readFile(path.join(root, "public", "days", "demo", "s1_food_icon.png"))).resize(32, 32, { kernel: "nearest" }).png().toBuffer());
const layout = buildWorldLayout(blueprint, sprites);
const manifest: DayManifest = {
  id, date: "2026-11-01", player: { name: "Offline sample character", sprite: "player.png", walkSheet: "player_walk.png" },
  scenes: [{
    kind: "tourist", base: "street", title: blueprint.title, time: blueprint.time,
    world: layout.world, spawn: layout.spawn, exit: layout.exit, landmarks: [],
    food: { sprite: "food.png", icon: "food.png", tile: layout.foodTile, text: blueprint.food!.text },
  }],
  transit: [],
};
parseDayManifest(manifest, id);
await writeFile(path.join(destination, "day.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(destination, "PREVIEW.txt"), "OFFLINE PREVIEW ONLY. Existing Shadwell artwork and demo lunch. No user photos were analysed. No paid API calls were made.\n");
console.log("Offline sample artwork preview: http://127.0.0.1:3000/day/world-preview");
