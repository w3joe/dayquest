import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, BlobPreconditionFailedError, del, head, list, put } from "@vercel/blob";
import { RequestError } from "./errors";

const LOCAL_ROOT = path.join(process.cwd(), ".data", "world-job-store");
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const localLeaseLocks = new Map<string, Promise<unknown>>();
async function withLocalLeaseLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = localLeaseLocks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  localLeaseLocks.set(id, next);
  try { return await next; } finally { if (localLeaseLocks.get(id) === next) localLeaseLocks.delete(id); }
}
const validId = (id: string) => /^[a-f0-9]{32}$/.test(id);
const prefixFor = (id: string) => `world-jobs/${id}/`;

function blobMode(id: string): boolean {
  if (!validId(id)) throw new RequestError("Invalid world ID.");
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_BASE_URL) return true;
  if (process.env.NODE_ENV === "production") throw new RequestError("World storage needs BLOB_READ_WRITE_TOKEN and BLOB_BASE_URL.", 503);
  return false;
}
function localPaths(id: string) {
  const directory = path.join(LOCAL_ROOT, id);
  return { directory, state: path.join(directory, "state.json"), lease: path.join(directory, "lease.json") };
}
const missing = (error: unknown) => error instanceof BlobNotFoundError || (error as NodeJS.ErrnoException)?.code === "ENOENT";

/** Metadata APIs read origin state. Public GETs may cache a previous 404 or an overwritten version. */
async function leaseHead(id: string) {
  try { return await head(`${prefixFor(id)}lease.json`, { abortSignal: AbortSignal.timeout(15_000) }); }
  catch (error) { if (missing(error)) return null; throw error; }
}

/** Discover immutable checkpoint URLs through the authenticated listing API, never a mutable public pointer. */
export async function readWorldCheckpoint<T>(id: string): Promise<T | null> {
  if (!blobMode(id)) {
    try { return parseState<T>(await readFile(/* turbopackIgnore: true */ localPaths(id).state, "utf8")); }
    catch (error) { if (missing(error)) return null; throw error; }
  }
  const prefix = `${prefixFor(id)}states/`;
  let cursor: string | undefined;
  let newest: { url: string; pathname: string; size: number; uploadedAt: Date } | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000, abortSignal: AbortSignal.timeout(15_000) });
    for (const candidate of page.blobs) {
      if (!/^\d{13}-[a-f0-9-]{36}\.json$/.test(candidate.pathname.slice(prefix.length))) continue;
      if (!newest || candidate.uploadedAt.getTime() > newest.uploadedAt.getTime() ||
        (candidate.uploadedAt.getTime() === newest.uploadedAt.getTime() && candidate.pathname > newest.pathname)) newest = candidate;
    }
    cursor = page.hasMore ? page.cursor : undefined;
    if (page.hasMore && !cursor) throw new RequestError("Saved world progress could not be listed. Please retry.", 503);
  } while (cursor);
  if (!newest) return null;
  if (newest.size > MAX_STATE_BYTES) throw new RequestError("Saved world progress is too large.", 503);
  // Every URL is new and has already been confirmed by list: no cached 404, overwrite or stale pointer.
  const response = await fetch(newest.url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new RequestError("Could not read saved world progress. Please retry.", 503);
  return parseState<T>(await response.text());
}
function parseState<T>(content: string): T {
  if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new RequestError("Saved world progress is too large.", 503);
  try { return JSON.parse(content) as T; }
  catch { throw new RequestError("Saved world progress could not be read. Please retry.", 503); }
}

/** Caller must hold the lease; save the checkpoint before releasing it. Never include source photo URLs. */
export async function writeWorldCheckpoint<T>(id: string, state: T): Promise<void> {
  const useBlob = blobMode(id);
  const content = JSON.stringify(state);
  if (typeof content !== "string" || Buffer.byteLength(content) > MAX_STATE_BYTES) throw new RequestError("World progress could not be saved.", 503);
  if (useBlob) {
    const filename = `${String(Date.now()).padStart(13, "0")}-${randomUUID()}.json`;
    await put(`${prefixFor(id)}states/${filename}`, content, {
      access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: false,
      abortSignal: AbortSignal.timeout(15_000),
    });
    return;
  }
  const paths = localPaths(id);
  await mkdir(paths.directory, { recursive: true });
  const temporary = `${paths.state}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await rename(temporary, paths.state);
  } finally { await unlink(temporary).catch(() => {}); }
}

/** Returns a fencing token; null means another worker still owns the lease. */
export async function acquireWorldLease(id: string, leaseMs: number): Promise<string | null> {
  const useBlob = blobMode(id);
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new RequestError("Invalid world lease.");
  if (useBlob) {
    const current = await leaseHead(id);
    if (current && current.uploadedAt.getTime() + leaseMs > Date.now()) return null;
    try {
      const lease = await put(`${prefixFor(id)}lease.json`, JSON.stringify({ nonce: randomUUID() }), {
        access: "public", contentType: "application/json", addRandomSuffix: false,
        ...(current ? { ifMatch: current.etag } : { allowOverwrite: false }),
        abortSignal: AbortSignal.timeout(15_000),
      });
      return lease.etag;
    } catch (error) {
      // Blob reports an already-existing create as BlobError, and a lost replacement CAS as precondition failure.
      if (error instanceof BlobPreconditionFailedError || (error instanceof Error && /already exists/i.test(error.message))) return null;
      throw error;
    }
  }
  // Serialise local expiry/release checks; wx additionally prevents fresh claims across processes.
  return withLocalLeaseLock(id, async () => {
    const paths = localPaths(id);
    await mkdir(paths.directory, { recursive: true });
    try {
    const lease = await stat(/* turbopackIgnore: true */ paths.lease);
      if (lease.mtimeMs + leaseMs > Date.now()) return null;
      await unlink(paths.lease);
    } catch (error) { if (!missing(error)) throw error; }
    const token = randomUUID();
    try { await writeFile(paths.lease, JSON.stringify({ token }), { flag: "wx", mode: 0o600 }); return token; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return null; throw error; }
  });
}

/** A late worker cannot release a newer worker's Blob lease. */
export async function releaseWorldLease(id: string, token: string): Promise<void> {
  if (blobMode(id)) {
    try { await del(`${prefixFor(id)}lease.json`, { ifMatch: token, abortSignal: AbortSignal.timeout(15_000) }); }
    catch (error) { if (!missing(error) && !(error instanceof BlobPreconditionFailedError)) throw error; }
    return;
  }
  await withLocalLeaseLock(id, async () => {
    const filename = localPaths(id).lease;
    try {
    const current = JSON.parse(await readFile(/* turbopackIgnore: true */ filename, "utf8")) as { token?: string };
      if (current.token === token) await unlink(filename);
    } catch (error) { if (!missing(error)) throw error; }
  });
}
