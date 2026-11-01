import sharp from "sharp";

const MAX_BYTES = 8 * 1024 * 1024;
const HEADERS = { "User-Agent": "DayQuest/0.1 (hackathon project)" };

/** One Wikimedia image as a ≤1024px PNG, or null if it's off-host, too big or undecodable. */
async function loadWikimediaImage(src: string | undefined, fetchImpl: typeof fetch): Promise<Buffer | null> {
  // Wikimedia serves lead images from upload. or (newer) thumb.wikimedia.org; nothing else is fetched.
  if (!src || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(src)) return null;
  try {
    const image = await fetchImpl(src, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!image.ok || Number(image.headers.get("content-length")) > MAX_BYTES) {
      await image.body?.cancel();
      return null;
    }
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    return await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * §5.2: Wikipedia lead image for a title. Tries the original, then the ~330px thumbnail
 * (some originals are 15 MB+). Any failure → null, and the prompt goes text-only.
 */
export async function fetchWikipediaImage(title: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | null> {
  if (!title) return null;
  try {
    const summary = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
      headers: HEADERS, signal: AbortSignal.timeout(8000),
    });
    if (!summary.ok) return null;
    const json = (await summary.json()) as { originalimage?: { source?: string }; thumbnail?: { source?: string } };
    return await loadWikimediaImage(json.originalimage?.source, fetchImpl)
      ?? await loadWikimediaImage(json.thumbnail?.source, fetchImpl);
  } catch {
    return null;
  }
}
