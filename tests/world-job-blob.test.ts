import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { readWorldCheckpoint } from "../lib/server/world-job-store";

/** Exercise the real Blob SDK over a local origin that caches anonymous 404s. */
test("checkpoint reads authenticate, retry only the newest state, and retain validation limits", async t => {
  const keys = ["BLOB_READ_WRITE_TOKEN", "BLOB_BASE_URL", "VERCEL_BLOB_API_URL"] as const;
  const previous = keys.map(key => process.env[key]);
  const id = randomUUID().replaceAll("-", "");
  const prefix = `world-jobs/${id}/states/`;
  const older = `${prefix}1793553000000-${randomUUID()}.json`;
  const newest = `${prefix}1793553001000-${randomUUID()}.json`;
  const state = { status: "running", completed: 3, checkpoint: { assets: { first: "first.png" } } };
  const token = "vercel_blob_rw_teststore_testtoken";
  let temporaryMisses = 0, attempts = 0, mode = "normal", api = "", empty = false;
  const paths: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, api);
    if (url.pathname === "/") {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ hasMore: false, blobs: empty ? [] : [older, newest].map((pathname, index) => ({
        pathname, url: `${api}/${pathname}`, downloadUrl: `${api}/${pathname}?download=1`, size: 100,
        uploadedAt: new Date(1793553000000 + index * 1000).toISOString(), etag: `state-${index}`,
      })) }));
      return;
    }
    // The public CDN has a stale negative cache entry even though origin has data.
    if (!request.headers.authorization) { response.writeHead(404); response.end(); return; }
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(url.searchParams.get("cache"), "0", "private origin reads must bypass the CDN");
    attempts++; paths.push(url.pathname.slice(1));
    if (temporaryMisses-- > 0) { response.writeHead(404); response.end(); return; }
    response.setHeader("content-type", "application/json");
    response.end(mode === "malformed" ? "not-json" : mode === "oversized" ? "x".repeat(2 * 1024 * 1024 + 1) : JSON.stringify(state));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  api = `http://localhost:${(server.address() as { port: number }).port}`;
  process.env.BLOB_READ_WRITE_TOKEN = token;
  process.env.BLOB_BASE_URL = api;
  process.env.VERCEL_BLOB_API_URL = api;
  t.after(async () => {
    for (const [index, key] of keys.entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const anonymous = await fetch(`${api}/${newest}`);
  assert.equal(anonymous.status, 404);
  assert.deepEqual(await readWorldCheckpoint(id), state, "authenticated origin content wins over the anonymous cached 404");
  assert.equal(attempts, 1);
  assert.deepEqual(paths, [newest]);

  attempts = 0; paths.length = 0; temporaryMisses = 2;
  assert.deepEqual(await readWorldCheckpoint(id), state);
  assert.equal(attempts, 3);
  assert.deepEqual(paths, [newest, newest, newest], "never replay an older checkpoint after a transient read miss");

  attempts = 0; temporaryMisses = 3;
  await assert.rejects(readWorldCheckpoint(id), /Could not read saved world progress/);
  assert.equal(attempts, 3);

  temporaryMisses = 0; mode = "malformed"; attempts = 0;
  await assert.rejects(readWorldCheckpoint(id), /could not be read/);
  assert.equal(attempts, 1, "corrupt data is not a transport retry");
  mode = "oversized";
  await assert.rejects(readWorldCheckpoint(id), /too large/);

  mode = "normal"; empty = true; attempts = 0;
  assert.equal(await readWorldCheckpoint(id), null);
  assert.equal(attempts, 0, "a genuinely new job has no checkpoint to download");
});
