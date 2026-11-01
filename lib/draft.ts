// Browser-safe handoff shared by Today and B's generating screen.
export const DRAFT_STORAGE_KEY = "dayquest:draft";
export const UPLOAD_KINDS = ["fit", "fit_back", "lunch", "landmark", "park", "extra"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export type Draft = { sessionId: string; uploads: { kind: UploadKind; url: string; note?: string }[]; spriteUrl?: string };
export const NOTE_MAX_LENGTH = 140;
/** Photos allowed per slot; Fit drives the character so it stays single. */
export const MAX_UPLOADS_PER_KIND = 12;
export const MAX_UPLOADS = 30;
export type ReadyDraft = Draft & { spriteUrl: string };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assetUrl(value: unknown, sessionId: string, kind: UploadKind | "player"): value is string {
  if (typeof value !== "string" || value !== value.trim() || !value) return false;
  // The only relative URLs produced by the development asset store.
  if (value.startsWith("/")) {
    const parts = value.split("/");
    const filename = parts[5];
    return parts.length === 6 && parts[1] === "api" && parts[2] === "assets" &&
      parts[3] === "uploads" && parts[4] === sessionId &&
      filename.startsWith(`${kind}-`) && filename.endsWith(".png") &&
      UUID_V4.test(filename.slice(kind.length + 1, -4));
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname &&
      !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Validate untrusted input and return only the fields in the shared contract. */
export function parseDraft(value: unknown): Draft | null {
  if (!record(value) || typeof value.sessionId !== "string" || !UUID_V4.test(value.sessionId) ||
      !Array.isArray(value.uploads) || value.uploads.length > MAX_UPLOADS) return null;
  const uploads: Draft["uploads"] = [];
  const counts = new Map<UploadKind, number>();
  for (const upload of value.uploads) {
    if (!record(upload) || !UPLOAD_KINDS.includes(upload.kind as UploadKind)) return null;
    const kind = upload.kind as UploadKind;
    const count = (counts.get(kind) ?? 0) + 1;
    if (count > (kind === "fit" || kind === "fit_back" ? 1 : MAX_UPLOADS_PER_KIND) || !assetUrl(upload.url, value.sessionId, kind)) return null;
    counts.set(kind, count);
    const note = typeof upload.note === "string" ? upload.note.trim().slice(0, NOTE_MAX_LENGTH) : "";
    uploads.push({ kind, url: upload.url, ...(note ? { note } : {}) });
  }
  if (value.spriteUrl !== undefined && (!counts.has("fit") || !assetUrl(value.spriteUrl, value.sessionId, "player"))) return null;
  return { sessionId: value.sessionId, uploads, ...(value.spriteUrl === undefined ? {} : { spriteUrl: value.spriteUrl as string }) };
}

/** Missing, outdated or malformed storage is recoverable, never a render error. */
export function parseStoredDraft(serialized: string | null): Draft | null {
  if (!serialized) return null;
  try { return parseDraft(JSON.parse(serialized)); } catch { return null; }
}

/** Ready for B's handoff structurally; image availability is checked separately. */
export function isReadyDraft(value: unknown): value is ReadyDraft {
  return !!parseDraft(value)?.spriteUrl;
}
