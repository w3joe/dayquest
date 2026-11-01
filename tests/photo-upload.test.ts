import test from "node:test";
import assert from "node:assert/strict";
import { discardPhotoUpload, startPhotoUpload } from "../lib/photo-upload";

test("replacement retains the committed photo while uploading and after failure", () => {
  const saved = { url: "https://example.com/front.png", preview: "old-preview", matching: "Saved" };
  const pending = startPhotoUpload(saved);
  const failed = { ...pending, preview: "new-preview", busy: false, error: "Upload failed" };
  assert.equal(failed.url, saved.url);
  assert.equal(failed.pending, true);
  assert.deepEqual(discardPhotoUpload(failed), saved);
});

test("retrying or choosing another replacement preserves the original rollback", () => {
  const saved = { url: "https://example.com/front.png", preview: "original" };
  const failed = { ...startPhotoUpload(saved), preview: "failed", busy: false, error: "Try again" };
  const retry = startPhotoUpload(failed);
  assert.equal(retry.error, undefined);
  assert.deepEqual(discardPhotoUpload(retry), saved);
  assert.deepEqual(discardPhotoUpload(startPhotoUpload()), {});
});
