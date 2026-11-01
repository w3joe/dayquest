import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import type { ReadyDraft } from "../draft";
import type { WorldJob } from "../world-job";
import { RequestError } from "./errors";
import { safeOpenAIError } from "./openai-errors";
import { acquireWorldLease, readWorldCheckpoint, releaseWorldLease, writeWorldCheckpoint } from "./world-job-store";
import { advanceWorldAssetBatch, advanceWorldBuild, type WorldCheckpoint } from "../../pipeline/world-build";
import { buildSceneAssetJobs } from "../../pipeline/scene-assets";
import { openAIImageGenerator } from "../../pipeline/imagegen";
import { loadStoredAsset, storeForDay } from "../../pipeline/publish";
import { planScene } from "../../pipeline/scene-plan";
import type { UploadKind } from "../../pipeline/types";

type JobState = WorldJob & { checkpoint: WorldCheckpoint; date: string };
// Greater than the route's 300s maximum; a timed-out request cannot overlap the next worker.
const LEASE_MS = 330_000;
const runtime = globalThis as typeof globalThis & { __worldLocks?: Map<string, Promise<unknown>> };
const locks = runtime.__worldLocks ??= new Map();

async function exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(id, next);
  try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
}

export function publicWorldJob(state: WorldJob): WorldJob {
  return { id: state.id, status: state.status, events: state.events, completed: state.completed,
    total: state.total, updatedAt: state.updatedAt, ...(state.error ? { error: state.error } : {}) };
}

export function worldJobId(draft: ReadyDraft): string {
  const uploads = [...draft.uploads].sort((a, b) => a.kind.localeCompare(b.kind));
  return createHash("sha256").update(JSON.stringify({ version: 1, session: draft.sessionId, uploads, player: draft.spriteUrl,
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare", textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini" })).digest("hex").slice(0, 32);
}

function initialState(id: string): JobState {
  return { id, status: "queued", date: new Date().toISOString().slice(0, 10),
    events: [{ step: "highlights", label: "Reading your photos and planning one explorable neighbourhood…" }],
    checkpoint: { assets: {} }, completed: 0, total: 0, updatedAt: new Date().toISOString() };
}

/** Source photo URLs stay in this request; public checkpoints contain processed assets and progress only. */
export async function prepareWorldJob(draft: ReadyDraft, retry = false): Promise<{ job: WorldJob; run?: () => Promise<void> }> {
  if (!process.env.OPENAI_API_KEY) throw new RequestError("Set OPENAI_API_KEY on the server to create your world.", 503);
  const id = worldJobId(draft);
  return exclusive(id, async () => {
    const current = await readWorldCheckpoint<JobState>(id);
    if (current && (current.status === "done" || (current.status === "error" && !retry))) return { job: publicWorldJob(current) };
    const lease = await acquireWorldLease(id, LEASE_MS);
    if (!lease) return { job: publicWorldJob(await readWorldCheckpoint<JobState>(id) ?? current ?? initialState(id)) };
    try {
      // Re-read AFTER acquiring the lease: another worker may have just finished a step.
      const state = await readWorldCheckpoint<JobState>(id) ?? initialState(id);
      if (state.status === "done" || (state.status === "error" && !retry)) {
        await releaseWorldLease(id, lease);
        return { job: publicWorldJob(state) };
      }
      const claimed: JobState = { ...state, error: undefined, status: "running", updatedAt: new Date().toISOString(),
        events: retry ? state.events.filter(event => event.step !== "error") : state.events };
      await writeWorldCheckpoint(id, claimed);
      return { job: publicWorldJob(claimed), run: () => processWorldStep(claimed, draft, lease) };
    } catch (error) { await releaseWorldLease(id, lease); throw error; }
  });
}

async function processWorldStep(state: JobState, draft: ReadyDraft, lease: string): Promise<void> {
  let progress = state;
  try {
    const uploads: Partial<Record<UploadKind, Buffer>> = {};
    const photoLoads = draft.uploads.filter(upload => ["fit", "lunch", "landmark"].includes(upload.kind)).map(async upload => {
      const bytes = await loadStoredAsset(upload.url);
      if (!bytes) throw new RequestError("A saved photo could not be loaded. Return to Today and add it again.", 422);
      uploads[upload.kind] = bytes;
    });
    const [player, styleReferences] = await Promise.all([
      loadStoredAsset(draft.spriteUrl),
      Promise.all(["shop_cafe.png", "station.png"].map(file => readFile(path.join(process.cwd(), "shadwell-25d", "assets", file)))),
      ...photoLoads,
    ]);
    const info = player ? await sharp(player).metadata().catch(() => null) : null;
    if (!player || info?.format !== "png" || info.width !== 32 || info.height !== 48 || !info.hasAlpha) {
      throw new RequestError("Your saved character could not be loaded. Return to Today and retry your character.", 422);
    }
    const input = { id: state.id, date: state.date, name: "You", uploads, player };
    const deps = { plan: (input: Parameters<typeof planScene>[0]) => planScene(input, new OpenAI({ timeout: 60_000, maxRetries: 0 })),
      images: openAIImageGenerator(new OpenAI({ timeout: 110_000, maxRetries: 0 })), store: storeForDay(state.id), styleReferences };
    if (state.checkpoint.blueprint && buildSceneAssetJobs(state.checkpoint.blueprint, input).some(job => !state.checkpoint.assets[job.id])) {
      await advanceWorldAssetBatch(input, state.checkpoint, deps, async (checkpoint, event, total) => {
        const next: JobState = { ...progress, checkpoint, total, completed: Object.keys(checkpoint.assets).length,
          updatedAt: new Date().toISOString(), events: [...progress.events, event] };
        await writeWorldCheckpoint(state.id, next);
        progress = next;
      });
      await writeWorldCheckpoint(state.id, { ...progress, status: "queued", updatedAt: new Date().toISOString() });
      return;
    }
    const result = await advanceWorldBuild(input, state.checkpoint, deps);
    const next: JobState = { ...state, checkpoint: result.checkpoint, total: result.total,
      completed: Object.keys(result.checkpoint.assets).length, status: result.manifest ? "done" : "queued",
      updatedAt: new Date().toISOString(), events: [...state.events, result.event] };
    await writeWorldCheckpoint(state.id, next);
  } catch (error) {
    const failure = safeOpenAIError(error);
    const next: JobState = { ...progress, status: "error", error: failure.message,
      updatedAt: new Date().toISOString(), events: [...progress.events, { step: "error", label: failure.message }] };
    await writeWorldCheckpoint(state.id, next);
  } finally {
    await releaseWorldLease(state.id, lease);
  }
}

export async function getWorldJob(id: string): Promise<WorldJob | null> {
  const state = await readWorldCheckpoint<JobState>(id);
  return state ? publicWorldJob(state) : null;
}
