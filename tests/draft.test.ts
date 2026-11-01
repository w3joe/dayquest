import test from "node:test";
import assert from "node:assert/strict";
import { isReadyDraft, parseDraft, parseStoredDraft } from "../lib/draft";

const sessionId = "49945629-6ceb-4cbf-b135-b7cbcace2f70";
const assetId = "12345678-1234-4567-8901-123456789012";
const fit = { kind: "fit", url: "https://assets.example.com/fit.png" };
const spriteUrl = "https://assets.example.com/player.png";

test("restores draft and ready handoff with Blob or exact local asset URLs", () => {
  const empty = { sessionId, uploads: [] };
  assert.deepEqual(parseStoredDraft(JSON.stringify(empty)), empty);
  assert.equal(isReadyDraft(empty), false);
  assert.equal(isReadyDraft({ sessionId, uploads: [fit] }), false);
  const ready = { sessionId, uploads: [fit], spriteUrl };
  assert.deepEqual(parseStoredDraft(JSON.stringify(ready)), ready);
  assert.equal(isReadyDraft(ready), true);
  const local = { sessionId, uploads: [{ kind: "fit", url: `/api/assets/uploads/${sessionId}/fit-${assetId}.png` }], spriteUrl: `/api/assets/uploads/${sessionId}/player-${assetId}.png` };
  assert.deepEqual(parseDraft(local), local);
});

test("malformed storage, invalid sessions, duplicate or unknown slots cannot become a draft", () => {
  for (const serialized of [null, "", "{", "null", "[]", "42"]) assert.equal(parseStoredDraft(serialized), null);
  for (const value of [
    { sessionId: "not-a-session", uploads: [] },
    { sessionId, uploads: null },
    { sessionId, uploads: [null] },
    { sessionId, uploads: [fit, fit] },
    { sessionId, uploads: [{ ...fit, kind: "unknown" }] },
    { sessionId, uploads: [], spriteUrl },
    { sessionId, uploads: [fit], spriteUrl: null },
  ]) assert.equal(parseDraft(value), null);
});

test("rejects unsafe or foreign local URLs in uploads and sprite handoff", () => {
  for (const url of ["javascript:alert(1)", "data:image/png,abc", "blob:https://example.com/id", "//example.com/fit.png", "/api/assets/../../secret", "https://user:secret@example.com/fit.png", `/api/assets/uploads/${sessionId}/lunch-${assetId}.png`]) {
    assert.equal(parseDraft({ sessionId, uploads: [{ kind: "fit", url }] }), null);
    assert.equal(isReadyDraft({ sessionId, uploads: [fit], spriteUrl: url }), false);
  }
});

test("allows several photos per slot and an extra slot, but only one fit", () => {
  const url = (kind: string, n: number) => `/api/assets/uploads/${sessionId}/${kind}-12345678-1234-4567-8901-12345678901${n}.png`;
  const draft = { sessionId, uploads: [{ kind: "fit", url: url("fit", 0) }, { kind: "lunch", url: url("lunch", 1), note: "  ramen  " }, { kind: "lunch", url: url("lunch", 2) }, { kind: "extra", url: url("extra", 3) }] };
  assert.equal(parseDraft(draft)?.uploads.length, 4);
  assert.equal(parseDraft(draft)?.uploads[1].note, "ramen");
  assert.equal(parseDraft({ sessionId, uploads: [draft.uploads[0], { kind: "fit", url: url("fit", 1) }] }), null);
  const many = Array.from({ length: 13 }, (_, i) => ({ kind: "extra", url: `https://assets.example.com/extra-${i}.png` }));
  assert.equal(parseDraft({ sessionId, uploads: many }), null);
});
