import { healthDate } from "./time";

export type HealthWorkout = { type: string; start: string; end: string; durationMin: number; distanceKm?: number; steps?: number };

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const ACTIVITY = (raw: string) => raw.replace("HKWorkoutActivityType", "").toLowerCase();

/**
 * Scans Apple Health's export.xml with regexes instead of building a DOM (exports are routinely hundreds of MB).
 * Steps are summed from StepCount records that fall inside each workout window.
 */
export function parseHealth(xml: string): HealthWorkout[] {
  if (!xml.includes("<HealthData")) throw new Error("This does not look like an Apple Health export.xml.");
  const workouts: HealthWorkout[] = [];
  for (const m of xml.matchAll(/<Workout\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (!a.startDate || !a.endDate) continue;
    const minutes = a.durationUnit === "sec" ? Number(a.duration) / 60 : a.durationUnit === "hr" ? Number(a.duration) * 60 : Number(a.duration);
    const km = a.totalDistanceUnit === "mi" ? Number(a.totalDistance) * 1.609344 : a.totalDistanceUnit === "m" ? Number(a.totalDistance) / 1000 : Number(a.totalDistance);
    workouts.push({ type: ACTIVITY(a.workoutActivityType ?? "workout"), start: healthDate(a.startDate), end: healthDate(a.endDate),
      durationMin: Math.round(minutes), distanceKm: Number.isFinite(km) ? Math.round(km * 10) / 10 : undefined });
  }
  const records = [...xml.matchAll(/<Record\b[^>]*HKQuantityTypeIdentifierStepCount[^>]*>/g)].map((m) => attrs(m[0]))
    .map((a) => ({ s: new Date(healthDate(a.startDate)).getTime(), e: new Date(healthDate(a.endDate)).getTime(), v: Number(a.value) }));
  for (const w of workouts) {
    const ws = new Date(w.start).getTime(), we = new Date(w.end).getTime();
    const inside = records.filter((r) => r.s >= ws - 1000 && r.e <= we + 1000);
    if (inside.length) w.steps = Math.round(inside.reduce((n, r) => n + r.v, 0));
  }
  return workouts;
}
