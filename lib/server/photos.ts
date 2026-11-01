import sharp from "sharp";
import { RequestError } from "./errors";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const UPLOAD_KINDS = ["fit", "fit_back", "lunch", "landmark", "park", "extra"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function validateSessionId(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestError("A valid sessionId is required. Reload the Today screen and try again.");
  }
  return value.toLowerCase();
}

export function validateKind(value: FormDataEntryValue | null): UploadKind {
  if (typeof value !== "string" || !UPLOAD_KINDS.includes(value as UploadKind)) {
    throw new RequestError("Choose a supported photo slot.");
  }
  return value as UploadKind;
}

export async function readPhotoForm(request: Request): Promise<FormData> {
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_REQUEST_BYTES) throw new RequestError("Photos must total less than 4 MB per request.", 413);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new RequestError("Send photos as multipart/form-data.", 415);
  }
  // Limit streamed requests too; Content-Length is optional and untrusted.
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("No photo was received.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestError("Photos must total less than 4 MB per request.", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new RequestError("The photo upload was not valid multipart data.");
  }
}

export async function sanitizePhoto(value: FormDataEntryValue | null): Promise<Buffer> {
  if (!value || typeof value === "string" || value.size === 0) throw new RequestError("Choose a photo first.");
  if (value.size > MAX_PHOTO_BYTES) throw new RequestError("Each photo must be smaller than 4 MB.", 413);
  if (!["image/jpeg", "image/png", "image/webp"].includes(value.type)) {
    throw new RequestError("Use a JPEG, PNG, or WebP photo.", 415);
  }
  try {
    const bytes = Buffer.from(await value.arrayBuffer());
    const input = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false });
    const metadata = await input.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
      throw new RequestError("Use a still JPEG, PNG, or WebP photo.", 415);
    }
    // Auto-orient before dropping metadata, including EXIF GPS and capture date.
    return await input.rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("This photo could not be decoded. Use a JPEG, PNG, or WebP under 20 megapixels.", 415);
  }
}
