import { ingest } from "@/lib/ingest/build";
import { readPhotoMeta, type PhotoMeta } from "@/lib/ingest/photos";
import { liveLookups } from "@/lib/ingest/places";
import { replayLookups, type RecordedLookups } from "@/lib/ingest/replay";
import { errorResponse, RequestError } from "@/lib/server/errors";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT = 150 * 1024 * 1024; // Apple Health exports are large; everything is parsed in memory.
const MAX_PHOTOS = 24;
const MAX_PHOTO = 12 * 1024 * 1024;

async function textField(form: FormData, name: string): Promise<string | undefined> {
  const v = form.get(name);
  if (!v || typeof v === "string") return undefined;
  if (v.size > MAX_TEXT) throw new RequestError(`${name} is too large (limit ${MAX_TEXT / 1024 / 1024} MB).`, 413);
  return v.size ? await v.text() : undefined;
}

/** The synthetic demo package ships in the repo and is ingested through the real parsers with recorded lookups (no network). */
async function demoPackage(): Promise<{ files: { timeline: string; health: string; gpx: string }; lookups: ReturnType<typeof replayLookups> }> {
  const dir = path.join(process.cwd(), "data/demo-package");
  const read = (f: string) => readFile(path.join(dir, f), "utf8");
  return {
    files: { timeline: await read("timeline.json"), health: await read("health-export.xml"), gpx: await read("route.gpx") },
    lookups: replayLookups(JSON.parse(await read("lookups.recorded.json")) as RecordedLookups),
  };
}

/**
 * POST multipart: `timeline` (Google Timeline JSON, required), `health` (Apple export.xml), `gpx`, `photos` (any number of images),
 * optional `date` (YYYY-MM-DD), `name`, `notes`. Photos are only read for EXIF time/GPS here; nothing is stored.
 */
export async function POST(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("demo") === "1") {
      const demo = await demoPackage();
      const result = await ingest(demo.files, { userName: "Lucas", notes: "Synthetic demo route.", lookups: demo.lookups });
      return Response.json({ ...result, synthetic: true });
    }
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new RequestError("Send the files as multipart/form-data.", 415);
    const form = await request.formData();
    const date = form.get("date");
    if (typeof date === "string" && date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RequestError("date must be YYYY-MM-DD.");
    const files = form.getAll("photos").filter((f): f is File => typeof f !== "string" && f.size > 0);
    if (files.length > MAX_PHOTOS) throw new RequestError(`At most ${MAX_PHOTOS} photos per import.`);
    const photos: PhotoMeta[] = [];
    for (const f of files) {
      if (f.size > MAX_PHOTO) throw new RequestError(`${f.name} is larger than ${MAX_PHOTO / 1024 / 1024} MB.`, 413);
      photos.push(await readPhotoMeta(f.name.replace(/[^\w.-]/g, "_"), new Uint8Array(await f.arrayBuffer())));
    }
    try {
      const result = await ingest(
        { timeline: await textField(form, "timeline"), health: await textField(form, "health"), gpx: await textField(form, "gpx"), photos },
        { date: typeof date === "string" && date ? date : undefined, userName: String(form.get("name") || "YOU"), notes: String(form.get("notes") || ""), lookups: liveLookups });
      return Response.json(result);
    } catch (error) {
      // Parser failures are the user's file problem, so report them rather than a generic 500.
      if (error instanceof RequestError) throw error;
      if (error instanceof Error) throw new RequestError(error.message, 422);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
