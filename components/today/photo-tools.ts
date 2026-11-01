const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** iPhone HEIC/HEIF photos can't be decoded by most browsers: convert them to JPEG in the browser first. */
export async function toDecodable(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
}

/** JPEG, PNG, WebP, HEIC/HEIF, or anything else the browser reports as an image. */
export const isAcceptedPhoto = (file: File) => ACCEPTED_TYPES.includes(file.type) || isHeic(file) || file.type.startsWith("image/");
export const ACCEPT_ATTR = "image/*,.heic,.heif";

/** Tiny pixel-style thumbnail (data URL) for a photo. */
export async function preview(file: File): Promise<string> {
  file = await toDecodable(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { bitmap = await createImageBitmap(file); }
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
    file = await toDecodable(file);
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
