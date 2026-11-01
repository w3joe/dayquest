import assert from "node:assert/strict";
import test from "node:test";
import { actionAvailable, advanceInteraction, beginInteraction, commitInteraction, emptyInteractionProgress, lookupInteractionAsset, restoreInteractionProgress, visibleInteractionScene } from "../game/interactions";
import { advanceJourney, checkpointJourney, restoreJourney } from "../game/journey";
import { parseDayManifest, type DayManifest } from "../lib/day";
import { composeWorldItinerary, importWorldPlayer, importWorldScene } from "../pipeline/compose-itinerary";
import { planSceneInteractions } from "../pipeline/interaction-plan";
import { mockScenePlan } from "../pipeline/scene-plan";
import { advanceWorldBuild, type WorldBuildDependencies, type WorldCheckpoint } from "../pipeline/world-build";

async function publishLocation(id: string): Promise<DayManifest> {
  const blueprint = mockScenePlan({ lunch: Buffer.from("offline lunch fixture") });
  const saved = new Map<string, Buffer>();
  let plannerCalls = 0;
  const deps: WorldBuildDependencies = {
    async plan() { throw new Error("saved photo analysis must not repeat"); },
    images: { live: false, async generate() { throw new Error("saved sprite generation must not repeat"); } },
    store: { manifestUrl: `https://${id}.example/day.json`, async put(name, bytes) { saved.set(name, bytes); } },
    async planInteractions(scene) {
      return planSceneInteractions(scene, { version: 1, assets: [
        { id: "held_lunch", src: "held-lunch.png", kind: "prop", width: 16, height: 16, description: "The supplied lunch prop for carrying." },
      ] }, { responses: { async create() {
        plannerCalls++;
        return { status: "completed", output_text: JSON.stringify({ actions: [
          { id: "take_lunch", targetId: "food", label: "Take your lunch along", repeatable: false,
            steps: [{ type: "attach", assetId: "held_lunch" }, { type: "setObject", state: "hidden" }, { type: "say", text: "Ready for the next stop." }] },
        ] }) };
      } } });
    },
  };
  // Resume exactly where the production worker starts the interaction stage.
  const checkpoint: WorldCheckpoint = { blueprint, assets: {
    building_0: "building_0.png", building_1: "building_1.png", building_2: "building_2.png", food: "food.png", player_walk: "player_walk.png",
  } };
  const input = { id, date: "2026-11-01", name: "You", uploads: {}, player: Buffer.from("accepted character fixture") };
  const planned = await advanceWorldBuild(input, checkpoint, deps);
  assert.equal(planned.manifest, undefined);
  assert.equal(saved.has("day.json"), false);
  assert.equal(plannerCalls, 1);
  const persisted = JSON.parse(JSON.stringify(planned.checkpoint)) as WorldCheckpoint;
  await advanceWorldBuild(input, persisted, deps);
  assert.equal(plannerCalls, 1, "publication must reuse the persisted interaction plan");
  return parseDayManifest(JSON.parse(saved.get("day.json")!.toString()), id);
}

test("published item actions survive location import, bus travel and refresh with the correct source assets", async () => {
  const first = await publishLocation("first-location"), second = await publishLocation("second-location");
  const firstUrl = "https://first.example/days/a/day.json", secondUrl = "https://second.example/days/b/day.json";
  const day = composeWorldItinerary({ id: "integrated-day", date: first.date, player: importWorldPlayer(first, firstUrl),
    scenes: [importWorldScene(first, firstUrl, "first"), importWorldScene(second, secondUrl, "second")],
    connections: [{ fromSceneId: "first", toSceneId: "second", legs: [{ mode: "bus", route: "24", destination: "Second stop", from: "First stop", to: "Second stop" }] }],
  });
  const action = day.scenes[0].interactionPack!.actions[0];
  const initialProgress = emptyInteractionProgress();
  let run = advanceInteraction(beginInteraction("first", action, initialProgress)!, action, { type: "approached" });
  assert.equal(run.phase, "steps");
  assert.equal(initialProgress.carried, null, "staged attachment is not saved before completion");
  run = advanceInteraction(run, action, { type: "confirm" });
  const progress = commitInteraction(initialProgress, run, action);
  let travel = restoreJourney(day);
  travel = advanceJourney(day, travel, { type: "prompt", journeyId: day.journeys![0].id, nearby: true });
  travel = advanceJourney(day, travel, { type: "confirm" });
  assert.equal(travel.phase, "boarding");
  const reloadedTravel = restoreJourney(day, JSON.stringify(checkpointJourney(day, travel)));
  const reloadedItems = restoreInteractionProgress(day, JSON.stringify(progress));
  assert.equal(reloadedTravel.sceneId, "second");
  assert.deepEqual(reloadedItems.carried, { sceneId: "first", assetId: "held_lunch" });
  assert.equal(lookupInteractionAsset(day, reloadedItems.carried)!.src, "https://first.example/days/a/held-lunch.png");
  assert.equal(day.scenes[1].interactionPack!.catalog.assets[0].src, "https://second.example/days/b/held-lunch.png");
  assert.equal(visibleInteractionScene(day.scenes[0], "first", reloadedItems).food, undefined);
  assert.ok(visibleInteractionScene(day.scenes[1], "second", reloadedItems).food);
  assert.equal(actionAvailable(action, "first", reloadedItems), false);
  assert.equal(actionAvailable(day.scenes[1].interactionPack!.actions[0], "second", reloadedItems), true);
  assert.equal(day.player.walkSheet, "https://first.example/days/a/player_walk.png");
});
