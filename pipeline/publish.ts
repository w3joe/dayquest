import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { generatedManifestUrl } from "@/lib/day";
import { readLocalAsset } from "@/lib/server/storage";

/** Where a day's day.json + PNGs go. Asset names are relative to day.json (§4.2). */
export interface DayStore {
  put(name: string, bytes: Buffer, contentType: string): Promise<void>;
  readonly manifestUrl: string;
}

/** Writes to a folder; used for public/days/demo and for local dev without Blob. */
export function localDayStore(dir: string, manifestUrl: string): DayStore {
  return {
    manifestUrl,
    async put(name, bytes) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), bytes);
    },
  };
}

/** Publishes at the stable path C's viewer fetches: <BLOB_BASE_URL>/days/<id>/<name>. */
export function blobDayStore(id: string, blobBaseUrl: string): DayStore {
  return {
    manifestUrl: generatedManifestUrl(id, blobBaseUrl),
    async put(name, bytes, contentType) {
      await put(`days/${id}/${name}`, bytes, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true });
    },
  };
}

/** Blob when configured; otherwise public/days/<id>/ in development (the viewer reads it from disk). */
export function storeForDay(id: string): DayStore {
  const { BLOB_READ_WRITE_TOKEN, BLOB_BASE_URL, NODE_ENV } = process.env;
  if (BLOB_READ_WRITE_TOKEN && BLOB_BASE_URL) return blobDayStore(id, BLOB_BASE_URL);
  if (NODE_ENV === "production") throw new Error("Day storage is not configured. Set BLOB_READ_WRITE_TOKEN and BLOB_BASE_URL.");
  return localDayStore(path.join(process.cwd(), "public", "days", id), `/days/${id}/day.json`);
}

/**
 * Load a photo or sprite C stored (local /api/assets/... or our own Blob store).
 * Only those two origins are fetched, so the request body can't make the server fetch arbitrary URLs.
 */
export async function loadStoredAsset(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("/api/assets/")) return await readLocalAsset(url.slice("/api/assets/".length).split("/"));
    if (url.startsWith("/")) return await readFile(path.join(process.cwd(), "public", path.normalize(url).replace(/^(\.\.[/\\])+/, "")));
    const parsed = new URL(url);
    const blobHost = process.env.BLOB_BASE_URL ? new URL(process.env.BLOB_BASE_URL).host : null;
    if (parsed.protocol !== "https:" || parsed.host !== blobHost || parsed.username || parsed.password) return null;
    const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= 8 * 1024 * 1024 ? bytes : null;
  } catch {
    return null;
  }
}
