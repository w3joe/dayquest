import type { DayManifest, DayScene, Landmark } from "@/lib/day";

/** §4.1 data/input.json */
export type DayInput = {
  user: { name: string; fitCheckPhoto?: string; fitCheckBackPhoto?: string };
  date: string;
  locations: { t: string; lat: number; lng: number; label: string }[];
  transport: (
    | { mode: "bus"; from: string; to: string; route: string; destination: string; via?: string[] }
    | { mode: "tube"; from: string; to: string; line: string; stations: string[] }
  )[];
  photos: { path: string; t: string; note?: string }[];
  workouts: { t: string; type: string; distanceKm: number; durationMin: number; steps: number }[];
  notes?: string;
};

/** §6.1 generating-log event. `at` (ms since start) is only written to recorded replays. */
export type GenerateEvent = {
  step: "highlights" | "landmarks" | "image" | "pixelate" | "done" | "error";
  label: string;
  thumb?: string;
  id?: string;
  at?: number;
};

/** What the LLM decides: §4.2 scenes without sprites or tile coordinates. */
export type PlannedLandmark = Omit<Landmark, "sprite"> & { wikiTitle?: string };
export type PlannedScene = Pick<DayScene, "kind" | "title" | "time" | "base"> & {
  landmarks: PlannedLandmark[];
  food?: { name: string; text: string };
};
export type DayPlan = { scenes: PlannedScene[] };

export type UploadKind = "fit" | "fit_back" | "lunch" | "landmark" | "park";
export type { DayManifest };
