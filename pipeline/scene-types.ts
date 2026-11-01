import type { WorldDesign } from "./world-design";

/** Photo-grounded inventory; scene geometry is constructed deterministically in code. */
export type SceneBlueprint = {
  title: string;
  locationName: string;
  description: string;
  time: string;
  ground: "street" | "park" | "plaza";
  buildings: { id: string; name: string; description: string; observed: boolean }[];
  props: { id: string; name: string; description: string; library?: string }[];
  food?: { name: string; description: string; text: string };
  source: "photo" | "fit-only";
  /** NPCs and interactables chosen by the design step (agents or the hand-written fallback). */
  design?: WorldDesign;
};

/** User-authored context only: do not pass the demo location history here. */
export type ScenePlanInput = {
  landmark?: Buffer;
  lunch?: Buffer;
  context?: { name?: string; date?: string; notes?: string };
};
