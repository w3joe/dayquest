import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse, RequestError } from "@/lib/server/errors";
import { isReadyDraft, parseDraft } from "@/lib/draft";
import sharp from "sharp";
import { modeFromEnv, newDayId, runGenerateDay } from "@/pipeline/generate";
import { loadStoredAsset, storeForDay } from "@/pipeline/publish";
import type { DayInput, GenerateEvent, UploadKind } from "@/pipeline/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type TracedDay = { date?: string; name?: string; locations?: DayInput["locations"]; workouts?: DayInput["workouts"] };
/** A recorded day from the iOS app replaces data/input.json's date, name, locations and workouts. */
function applyTracedDay(input: DayInput, day: TracedDay | undefined): DayInput {
  if (!day || typeof day !== "object") return input;
  const locations = Array.isArray(day.locations)
    ? day.locations.filter((l) => typeof l?.t === "string" && Number.isFinite(l.lat) && Number.isFinite(l.lng) && typeof l.label === "string").slice(0, 200)
    : [];
  if (Array.isArray(day.locations) && locations.length === 0) throw new RequestError("day.locations needs at least one { t, lat, lng, label } stop.");
  const workouts = Array.isArray(day.workouts)
    ? day.workouts.filter((w) => typeof w?.t === "string" && typeof w.type === "string" && [w.distanceKm, w.durationMin, w.steps].every(Number.isFinite))
    : [];
  return {
    ...input,
    date: typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : input.date,
    user: { ...input.user, name: typeof day.name === "string" && day.name.trim() ? day.name.trim().slice(0, 12).toUpperCase() : input.user.name },
    locations: locations.length ? locations : input.locations,
    workouts: workouts.length ? workouts : input.workouts,
  };
}

/**
 * §8: ready draft → NDJSON stream; the last event has the published day's id.
 * The iOS app also sends `day` (its recorded trace). It may skip the fit check, in which case
 * the pipeline paints a placeholder character.
 */
export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => null)) as { day?: TracedDay } | null;
    const traced = raw && typeof raw.day === "object" && raw.day !== null ? raw.day : undefined;
    const body = parseDraft(traced ? { sessionId: crypto.randomUUID(), uploads: [], ...raw } : raw);
    if (!body || (!traced && !isReadyDraft(body))) {
      throw new RequestError("Return to Today and finish your fit check before building your day.");
    }
    const mode = modeFromEnv();
    const uploads: Partial<Record<UploadKind, Buffer>> = {};
    for (const upload of body.uploads) {
      const bytes = await loadStoredAsset(upload.url);
      if (!bytes) throw new RequestError("A saved photo could not be loaded. Return to Today and upload it again.", 422);
      uploads[upload.kind] = bytes;
    }
    const player = body.spriteUrl ? await loadStoredAsset(body.spriteUrl) : traced ? undefined : null;
    if (player === null) throw new RequestError("Your character could not be loaded. Return to Today and retry the fit check.", 422);
    const metadata = player ? await sharp(player).metadata().catch(() => null) : undefined;
    if (metadata !== undefined && (metadata?.format !== "png" || metadata.width !== 32 || metadata.height !== 48 || !metadata.hasAlpha)) {
      throw new RequestError("Your character is not a valid 32×48 PNG. Return to Today and retry the fit check.", 422);
    }
    const template = JSON.parse(await readFile(path.join(process.cwd(), "data", "input.json"), "utf8")) as DayInput;
    const input = applyTracedDay(template, traced);
    const id = newDayId();
    const store = storeForDay(id);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: GenerateEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          await runGenerateDay({ id, input, store, uploads, player, ...mode }, send);
        } catch (error) {
          console.error("generate-day failed", error instanceof Error ? error.message : error);
          send({ step: "error", label: "SOMETHING WENT WRONG BUILDING YOUR WORLD. PLEASE TRY AGAIN." });
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
