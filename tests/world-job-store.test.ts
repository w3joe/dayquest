import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { acquireWorldLease, readWorldCheckpoint, releaseWorldLease, writeWorldCheckpoint } from "../lib/server/world-job-store";

test("local journal persists checkpoints and leases fence concurrent claims, expiry and late releases", async t => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN, savedBase = process.env.BLOB_BASE_URL, savedMode = process.env.NODE_ENV;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_BASE_URL;
  Reflect.set(process.env, "NODE_ENV", "test");
  const id = randomUUID().replaceAll("-", "");
  const directory = path.join(process.cwd(), ".data", "world-job-store", id);
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    for (const [name, value] of [["BLOB_READ_WRITE_TOKEN", savedToken], ["BLOB_BASE_URL", savedBase], ["NODE_ENV", savedMode]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  });
  assert.equal(await readWorldCheckpoint(id), null);
  const [first, blocked] = await Promise.all([acquireWorldLease(id, 1000), acquireWorldLease(id, 1000)]);
  assert.ok(first); assert.equal(blocked, null);
  await writeWorldCheckpoint(id, { status: "queued", assets: { first: "first.png" } });
  assert.deepEqual(await readWorldCheckpoint(id), { status: "queued", assets: { first: "first.png" } });
  await writeWorldCheckpoint(id, { status: "done", assets: { first: "first.png", second: "second.png" } });
  assert.equal((await readWorldCheckpoint<{ status: string }>(id))?.status, "done");
  assert.equal((await stat(path.join(directory, "state.json"))).mode & 0o777, 0o600);
  await releaseWorldLease(id, "wrong-token");
  assert.equal(await acquireWorldLease(id, 1000), null);
  const past = new Date(Date.now() - 5000);
  await utimes(path.join(directory, "lease.json"), past, past);
  const replacements = await Promise.all([acquireWorldLease(id, 1000), acquireWorldLease(id, 1000)]);
  assert.equal(replacements.filter(Boolean).length, 1);
  const second = replacements.find(Boolean)!;
  assert.notEqual(second, first);
  await releaseWorldLease(id, first);
  assert.equal(await acquireWorldLease(id, 1000), null, "late worker must not release replacement lease");
  await releaseWorldLease(id, second);
  const third = await acquireWorldLease(id, 1000);
  assert.ok(third); await releaseWorldLease(id, third);
  await assert.rejects(readWorldCheckpoint("../../outside"), /Invalid world ID/);
  await assert.rejects(acquireWorldLease(id, 0), /Invalid world lease/);
  await assert.rejects(writeWorldCheckpoint(id, { value: "x".repeat(2 * 1024 * 1024) }), /could not be saved/);
  assert.equal((await readWorldCheckpoint<{ status: string }>(id))?.status, "done");
});
