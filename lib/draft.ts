// Browser-safe handoff shared by Today and B's generating screen.
export const DRAFT_STORAGE_KEY = "dayquest:draft";
export const UPLOAD_KINDS = ["fit", "fit_back", "lunch", "landmark", "park"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export type Draft = { sessionId: string; uploads: { kind: UploadKind; url: string }[]; spriteUrl?: string };
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
      !Array.isArray(value.uploads) || value.uploads.length > UPLOAD_KINDS.length) return null;
  const uploads: Draft["uploads"] = [];
  const seen = new Set<UploadKind>();
  for (const upload of value.uploads) {
    if (!record(upload) || !UPLOAD_KINDS.includes(upload.kind as UploadKind)) return null;
    const kind = upload.kind as UploadKind;
    if (seen.has(kind) || !assetUrl(upload.url, value.sessionId, kind)) return null;
    seen.add(kind);
    uploads.push({ kind, url: upload.url });
  }
  if (value.spriteUrl !== undefined && (!seen.has("fit") || !assetUrl(value.spriteUrl, value.sessionId, "player"))) return null;
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
