/** Offline interaction fixture. Reuses existing sample art; no model or image requests. */
import "./preview-transport.mts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { compileInteractionPack, parseInteractionCatalog, type InteractionCatalog } from "../lib/interactions";
import { importWorldScene } from "../pipeline/compose-itinerary";

const id = "interaction-preview";
const sourceUrl = "/days/transport-preview/day.json";
const original = parseDayManifest(JSON.parse(await readFile(path.join(process.cwd(), "public", sourceUrl), "utf8")), "transport-preview");
const scenes = original.scenes.map((_, index) => importWorldScene(original, sourceUrl, original.scenes[index].id!, index));
scenes[0].title = "Sample interactions · supplied London artwork";
scenes[0].world!.objects.push({ id: "sample_snack_display", name: "Sample ramen bowl", sprite: "/interactions/library/ramen-bowl-v1.png",
  x: 376, y: 207, width: 18, height: 17, removable: true, collision: { x: 368, y: 201, width: 16, height: 6 },
  text: "A sample ramen bowl from the supplied London asset library." });

const supplied = parseInteractionCatalog(JSON.parse(await readFile(path.join(process.cwd(), "data", "interaction-catalog.json"), "utf8")));
const demoPoses = parseInteractionCatalog(JSON.parse(await readFile(path.join(process.cwd(), "data", "demo-interaction-catalog.json"), "utf8")));
// These supplied poses match the fixed Lucas/Shawn preview actor. Production photo avatars use only the shared prop/effect catalogue.
const catalog: InteractionCatalog = { version: 1, assets: [...supplied.assets, ...demoPoses.assets] };
scenes[0].interactionPack = compileInteractionPack(scenes[0], { actions: [
  { id: "inspect_snack", targetId: "sample_snack_display", label: "Look at the sample ramen", repeatable: true,
    requires: { notCompleted: ["take_snack"] },
    steps: [{ type: "face", direction: "up" }, { type: "animate", assetId: "steam_v1", durationMs: 700 },
      { type: "say", text: "A steaming sample bowl. The bowl and steam come from the supplied London artwork." }] },
  { id: "take_snack", targetId: "sample_snack_display", label: "Carry the sample ramen", repeatable: false,
    steps: [{ type: "face", direction: "up" }, { type: "wait", durationMs: 300 }, { type: "attach", assetId: "ramen_bowl_v1" },
      { type: "setObject", state: "hidden" }, { type: "say", text: "The bowl will stay with you between scenes. Finish this message to save; Escape cancels without changing the display." }] },
  { id: "put_away", targetId: "cafe_board", label: "Put the sample ramen away", repeatable: true,
    requires: { completed: ["take_snack"] }, steps: [{ type: "detach" }, { type: "say", text: "Your hands are free again." }] },
  { id: "take_photo", targetId: "building_1", label: "Take a photo of the sample building", repeatable: true,
    steps: [{ type: "face", direction: "up" }, { type: "animate", assetId: "lucas_photo_v1", durationMs: 900 },
      { type: "animate", assetId: "camera_flash_v1", durationMs: 200 }, { type: "say", text: "A little snapshot of this sample street." }] },
  { id: "wave", targetId: "cafe_board", label: "Wave to the sample street", repeatable: true,
    steps: [{ type: "face", direction: "down" }, { type: "animate", assetId: "lucas_wave_v1", durationMs: 900 },
      { type: "say", text: "A friendly wave from Lucas, using his supplied animation strip." }] },
  { id: "point", targetId: "cafe_board", label: "Point at the sample board", repeatable: true,
    steps: [{ type: "face", direction: "up" }, { type: "animate", assetId: "lucas_point_v1", durationMs: 600 },
      { type: "say", text: "The supplied pointing animation belongs to this preview character." }] },
] }, catalog);
scenes[1].interactionPack = compileInteractionPack(scenes[1], { actions: [
  { id: "read_board", targetId: "cafe_board", label: "Read the sample lunch board", repeatable: true,
    steps: [{ type: "say", text: "A second scene with its own interactions. Carried props and completed actions persist independently of travel." }] },
] }, { version: 1, assets: [] });

const directory = path.join(process.cwd(), "public", "days", id);
await mkdir(directory, { recursive: true });
const walkSheet = await sharp(path.join(process.cwd(), "london-25d", "assets", "shared", "shawn.png"))
  .extract({ left: 0, top: 0, width: 96, height: 192 }).png().toBuffer();
await writeFile(path.join(directory, "player_walk.png"), walkSheet);
await writeFile(path.join(directory, "player.png"), await sharp(walkSheet).extract({ left: 0, top: 144, width: 32, height: 48 }).png().toBuffer());
const manifest: DayManifest = { ...original, id, player: { name: "Lucas preview", sprite: "player.png", walkSheet: "player_walk.png" }, scenes };
parseDayManifest(manifest, id);
await writeFile(path.join(directory, "day.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(directory, "PREVIEW.txt"), "Offline sample interactions and fictional travel. Supplied London props, effects and matching Lucas poses. No API calls.\n");
console.log("Interaction preview: http://127.0.0.1:3000/day/interaction-preview");
