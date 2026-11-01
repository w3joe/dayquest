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

/** §8: ready draft → NDJSON stream; the last event has the published day's id. */
export async function POST(request: Request) {
  try {
    const body = parseDraft(await request.json().catch(() => null));
    if (!isReadyDraft(body)) {
      throw new RequestError("Return to Today and finish your fit check before building your day.");
    }
    const mode = modeFromEnv();
    const uploads: Partial<Record<UploadKind, Buffer>> = {};
    for (const upload of body.uploads.filter((upload, i) => body.uploads.findIndex(other => other.kind === upload.kind) === i)) {
      const bytes = await loadStoredAsset(upload.url);
      if (!bytes) throw new RequestError("A saved photo could not be loaded. Return to Today and upload it again.", 422);
      uploads[upload.kind] = bytes;
    }
    const player = await loadStoredAsset(body.spriteUrl);
    if (!player) throw new RequestError("Your character could not be loaded. Return to Today and retry the fit check.", 422);
    const metadata = await sharp(player).metadata().catch(() => null);
    if (metadata?.format !== "png" || metadata.width !== 32 || metadata.height !== 48 || !metadata.hasAlpha) {
      throw new RequestError("Your character is not a valid 32×48 PNG. Return to Today and retry the fit check.", 422);
    }
    const input = JSON.parse(await readFile(path.join(process.cwd(), "data", "input.json"), "utf8")) as DayInput;
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
