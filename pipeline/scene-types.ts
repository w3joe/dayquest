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
};

/** User-authored context only: do not pass the demo location history here. */
export type ScenePlanInput = {
  landmark?: Buffer;
  lunch?: Buffer;
  context?: { name?: string; date?: string; notes?: string };
};
