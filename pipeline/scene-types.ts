import type { BlockUsage, WorldKit } from "../lib/world-kit";
import type { Composition } from "../game/composition";
import type { TemplateId } from "../game/layout-templates";
import type { WorldDesign } from "./world-design";
import type { UploadKind } from "./types";

/** Photo-grounded inventory; scene geometry is constructed deterministically in code. */
export type SceneBlueprint = {
  title: string;
  locationName: string;
  description: string;
  time: string;
  ground: "street" | "park" | "plaza";
  buildings: { id: string; name: string; description: string; observed: boolean; usage?: BlockUsage }[];
  props: { id: string; name: string; description: string; library?: string; usage?: BlockUsage }[];
  food?: { name: string; description: string; text: string };
  source: "photo" | "fit-only";
  /** NPCs and interactables chosen by the design step (agents or the hand-written fallback). */
  design?: WorldDesign;
  /** The kind of place to build. Chosen by the world builder; when absent it follows `ground`. */
  template?: TemplateId;
  /** Scenery chosen by the world builder from the kit; when absent the template's default applies. */
  composition?: Composition;
  /** Persisted construction context shared by artists, composer and exported blocks. */
  kit?: WorldKit;
};

/** User-authored context only: do not pass the demo location history here. */
export type ScenePlanInput = {
  landmark?: Buffer;
  lunch?: Buffer;
  /** All uploaded inputs; only the first place/meal images anchor their sprites. */
  photos?: { kind: UploadKind; bytes: Buffer; note?: string }[];
  context?: { name?: string; date?: string; notes?: string };
};
