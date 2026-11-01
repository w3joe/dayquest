/** Tiny pixel-style thumbnail (data URL) for a photo. */
export async function preview(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not preview this image.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { bitmap.close(); }
}

/** "Photo time · 12:30" from EXIF, or a neutral fallback. */
export async function matchPhoto(file: File): Promise<string> {
  try {
    const { parse } = await import("exifr");
    const metadata = await parse(file, ["DateTimeOriginal", "CreateDate"]);
    const time = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
    if (!(time instanceof Date) || Number.isNaN(time.getTime())) return "No photo time found";
    return `Photo time · ${time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return "No photo time found"; }
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const MAX_SIDE = 2048;
const COMPRESS_ABOVE = 1024 * 1024;

/**
 * Phone cameras produce big photos (often 3-6 MB, over the server's 4 MB limit).
 * Downscale and re-encode as JPEG in the browser; small photos pass through untouched.
 * Falls back to the original file if the browser cannot decode it.
 */
export async function preparePhoto(file: File): Promise<File> {
  try {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { bitmap = await createImageBitmap(file); }
    try {
      if (file.size <= COMPRESS_ABOVE && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE) return file;
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob || (blob.size >= file.size && file.size <= MAX_PHOTO_BYTES)) return file;
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally { bitmap.close(); }
  } catch { return file; }
}
