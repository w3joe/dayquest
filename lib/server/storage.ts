import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { RequestError } from "./errors";

const LOCAL_ROOT = path.join(process.cwd(), ".data", "assets");

export function localAssetPath(segments: string[]): string {
  // Only paths produced by storeSessionAsset are readable. No public filesystem access.
  if (segments.length !== 3 || segments[0] !== "uploads" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(segments[1]) ||
      !/^(fit|fit_back|lunch|landmark|park|player)-[0-9a-f-]{36}\.png$/.test(segments[2])) {
    throw new RequestError("Asset not found.", 404);
  }
  return path.join(LOCAL_ROOT, ...segments);
}

export async function storeSessionAsset(sessionId: string, kind: string, bytes: Buffer): Promise<string> {
  const segments = ["uploads", sessionId, `${kind}-${randomUUID()}.png`];
  const localPath = localAssetPath(segments); // Validate paths even when using Blob.
  const key = segments.join("/");
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(key, bytes, { access: "public", contentType: "image/png", addRandomSuffix: false });
      return blob.url;
    } catch {
      throw new RequestError("Photo storage is unavailable. Please try again.", 503);
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new RequestError("Photo storage is not configured. Set BLOB_READ_WRITE_TOKEN on the server.", 503);
  }
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, bytes, { flag: "wx" });
  return `/api/assets/${key}`;
}

export async function readLocalAsset(segments: string[]): Promise<Buffer> {
  if (process.env.NODE_ENV === "production") throw new RequestError("Asset not found.", 404);
  const filename = localAssetPath(segments);
  try {
    return await readFile(filename);
  } catch {
    throw new RequestError("Asset not found.", 404);
  }
}
