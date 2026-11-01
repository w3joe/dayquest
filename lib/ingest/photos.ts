/** `takenLocal` is the camera's wall-clock time ("YYYY-MM-DD HH:MM"): EXIF has no zone, so it must not be shifted. */
export type PhotoMeta = { name: string; takenLocal?: string; lat?: number; lng?: number };

/** Reads capture time and GPS from an image before the upload pipeline strips metadata. */
export async function readPhotoMeta(name: string, bytes: Uint8Array): Promise<PhotoMeta> {
  const { parse } = await import("exifr");
  try {
    const exif = await parse(bytes, { gps: true, exif: true, tiff: true, pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "latitude", "longitude"] });
    const taken: Date | string | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate;
    const p2 = (n: number) => String(n).padStart(2, "0");
    // exifr builds the Date from the EXIF wall-clock in the process zone, so local getters give the camera's time back.
    const takenLocal = taken instanceof Date && !Number.isNaN(taken.getTime())
      ? `${taken.getFullYear()}-${p2(taken.getMonth() + 1)}-${p2(taken.getDate())} ${p2(taken.getHours())}:${p2(taken.getMinutes())}` : undefined;
    return { name, takenLocal, lat: exif?.latitude, lng: exif?.longitude };
  } catch {
    return { name };
  }
}
