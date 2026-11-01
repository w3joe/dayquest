import type { DayManifest, Journey, JourneyLeg } from "../lib/day";

export type JourneyPhase = "exploring" | "prompt" | "boarding" | "riding" | "transfer" | "arriving";
export type JourneyState = {
  sceneId: string;
  phase: JourneyPhase;
  journeyId?: string;
  legIndex: number;
  phaseMs: number;
  completed: string[];
};
export type JourneyCheckpoint = { version: 1; sceneId: string; completed: string[] };
export type JourneyEvent =
  | { type: "prompt"; journeyId: string; nearby: boolean }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "skip" }
  | { type: "tick"; deltaMs: number };
export const BOARDING_MS = 1300;
export const TRANSFER_MS = 1400;
export const ARRIVAL_MS = 1400;
export const journeyStorageKey = (id: string) => `dayquest:journey:${id}`;
export function activeJourney(manifest: DayManifest, state: JourneyState): Journey | undefined {
  return manifest.journeys?.find(journey => journey.id === state.journeyId);
}
export function departureJourney(manifest: DayManifest, state: JourneyState): Journey | undefined {
  return manifest.journeys?.find(journey => journey.fromSceneId === state.sceneId && !state.completed.includes(journey.id));
}
export function legDuration(leg: JourneyLeg): number {
  const duration = Number.isFinite(leg.durationMs) ? leg.durationMs! : (leg.mode === "walk" ? 3800 : 5500);
  return Math.max(1000, Math.min(15_000, duration));
}
export function journeyPhaseDuration(manifest: DayManifest, state: JourneyState): number {
  if (state.phase === "boarding") return BOARDING_MS;
  if (state.phase === "transfer") return TRANSFER_MS;
  if (state.phase === "arriving") return ARRIVAL_MS;
  if (state.phase === "riding") {
    const leg = activeJourney(manifest, state)?.legs[state.legIndex];
    return leg ? legDuration(leg) : 1;
  }
  return Infinity;
}
/** Invalid/old browser state cannot select an absent scene or replay a completed connection. */
export function restoreJourney(manifest: DayManifest, stored?: unknown): JourneyState {
  const sceneIds = manifest.scenes.map(scene => scene.id).filter((id): id is string => Boolean(id));
  const first = sceneIds[0] ?? "";
  let checkpoint: Partial<JourneyCheckpoint> | undefined;
  try {
    const raw = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.version === 1 && sceneIds.includes(raw.sceneId)) checkpoint = raw;
  } catch { /* Corrupt browser storage starts at the first scene. */ }
  const sceneId = checkpoint?.sceneId ?? first;
  const position = sceneIds.indexOf(sceneId);
  // Sequential scenes determine completed travel; never trust arbitrary saved completed IDs.
  const completed = (manifest.journeys ?? []).filter(journey => sceneIds.indexOf(journey.toSceneId) <= position).map(journey => journey.id);
  return { sceneId, phase: "exploring", legIndex: 0, phaseMs: 0, completed };
}
/** Once boarding begins, refresh resumes at the destination instead of boarding twice. */
export function checkpointJourney(manifest: DayManifest, state: JourneyState): JourneyCheckpoint {
  const journey = activeJourney(manifest, state);
  const inTransit = journey && ["boarding", "riding", "transfer"].includes(state.phase);
  return { version: 1, sceneId: inTransit ? journey.toSceneId : state.sceneId,
    completed: [...new Set([...state.completed, ...(inTransit ? [journey.id] : [])])] };
}
function arrive(state: JourneyState, journey: Journey): JourneyState {
  return { ...state, sceneId: journey.toSceneId, phase: "arriving", phaseMs: 0,
    completed: [...new Set([...state.completed, journey.id])] };
}
/** Pure state machine: confirmations/skips cannot advance the scene more than once. */
export function advanceJourney(manifest: DayManifest, state: JourneyState, event: JourneyEvent): JourneyState {
  if (event.type === "prompt") {
    const next = departureJourney(manifest, state);
    if (state.phase !== "exploring" || !event.nearby || next?.id !== event.journeyId) return state;
    return { ...state, phase: "prompt", journeyId: next.id, legIndex: 0, phaseMs: 0 };
  }
  if (event.type === "cancel") return state.phase === "prompt" ? { ...state, phase: "exploring", journeyId: undefined, phaseMs: 0 } : state;
  const journey = activeJourney(manifest, state);
  if (!journey) return state;
  if (event.type === "confirm") return state.phase === "prompt" ? { ...state, phase: "boarding", phaseMs: 0 } : state;
  if (event.type === "skip") return ["boarding", "riding", "transfer"].includes(state.phase) ? arrive(state, journey) : state;
  if (event.type !== "tick" || !Number.isFinite(event.deltaMs) || event.deltaMs <= 0) return state;
  if (!["boarding", "riding", "transfer", "arriving"].includes(state.phase)) return state;
  // Consume large frame deltas safely, including all mixed-mode transfers, but never another journey.
  let next = { ...state }, remaining = Math.min(event.deltaMs, 300_000);
  for (let guard = 0; guard < 64 && remaining > 0 && next.phase !== "exploring"; guard++) {
    const duration = journeyPhaseDuration(manifest, next), consumed = Math.min(remaining, Math.max(0, duration - next.phaseMs));
    next = { ...next, phaseMs: next.phaseMs + consumed }; remaining -= consumed;
    if (next.phaseMs < duration) break;
    if (next.phase === "boarding" || next.phase === "transfer") next = { ...next, phase: "riding", phaseMs: 0 };
    else if (next.phase === "riding") {
      next = next.legIndex + 1 < journey.legs.length
        ? { ...next, phase: "transfer", legIndex: next.legIndex + 1, phaseMs: 0 }
        : arrive(next, journey);
    } else if (next.phase === "arriving") next = { ...next, phase: "exploring", journeyId: undefined, phaseMs: 0, legIndex: 0 };
  }
  return next;
}
