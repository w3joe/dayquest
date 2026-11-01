/** Offline interaction fixture. Reuses existing sample art; no model or image requests. */
import "./preview-transport.mts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { compileInteractionPack, type InteractionCatalog } from "../lib/interactions";
import { importWorldPlayer, importWorldScene } from "../pipeline/compose-itinerary";

const id = "interaction-preview";
const sourceUrl = "/days/transport-preview/day.json";
const original = parseDayManifest(JSON.parse(await readFile(path.join(process.cwd(), "public", sourceUrl), "utf8")), "transport-preview");
const scenes = original.scenes.map((_, index) => importWorldScene(original, sourceUrl, original.scenes[index].id!, index));
scenes[0].title = "Sample interactions · existing artwork";
scenes[0].world!.objects.push({ id: "sample_snack_display", name: "Sample snack", sprite: "/days/transport-preview/food.png",
  x: 376, y: 207, width: 32, height: 32, removable: true, collision: { x: 368, y: 201, width: 16, height: 6 },
  text: "An offline sample prop. The final asset library will be provided later." });

const catalog: InteractionCatalog = { version: 1, assets: [
  { id: "sample_snack", src: "/days/transport-preview/food.png", width: 32, height: 32, kind: "prop" },
  { id: "sample_food_effect", src: "/days/transport-preview/food.png", width: 32, height: 32, kind: "effect" },
] };
scenes[0].interactionPack = compileInteractionPack(scenes[0], { actions: [
  { id: "inspect_snack", targetId: "sample_snack_display", label: "Look at the sample snack", repeatable: true,
    requires: { notCompleted: ["take_snack"] },
    steps: [{ type: "face", direction: "up" }, { type: "animate", assetId: "sample_food_effect", durationMs: 700 },
      { type: "say", text: "This sample uses an existing lunch icon. Supplied props and animations will expand what you can do." }] },
  { id: "take_snack", targetId: "sample_snack_display", label: "Carry the sample snack", repeatable: false,
    steps: [{ type: "face", direction: "up" }, { type: "wait", durationMs: 300 }, { type: "attach", assetId: "sample_snack" },
      { type: "setObject", state: "hidden" }, { type: "say", text: "The snack will stay with you between scenes. Finish this message to save; Escape cancels without changing the display." }] },
  { id: "put_away", targetId: "cafe_board", label: "Put the sample snack away", repeatable: true,
    requires: { completed: ["take_snack"] }, steps: [{ type: "detach" }, { type: "say", text: "Your hands are free again." }] },
] }, catalog);
scenes[1].interactionPack = compileInteractionPack(scenes[1], { actions: [
  { id: "read_board", targetId: "cafe_board", label: "Read the sample lunch board", repeatable: true,
    steps: [{ type: "say", text: "A second scene with its own interactions. Carried props and completed actions persist independently of travel." }] },
] }, { version: 1, assets: [] });

const manifest: DayManifest = { ...original, id, player: importWorldPlayer(original, sourceUrl), scenes };
parseDayManifest(manifest, id);
const directory = path.join(process.cwd(), "public", "days", id);
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "day.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(directory, "PREVIEW.txt"), "Offline sample interactions and fictional travel. Existing artwork only; final assets have not been supplied. No API calls.\n");
console.log("Interaction preview: http://127.0.0.1:3000/day/interaction-preview");
