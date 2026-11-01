import sharp from "sharp";

const MAX_BYTES = 8 * 1024 * 1024;

/** §5.2: Wikipedia lead image for a title, as a ≤1024px PNG. Any failure → null (text-only prompt). */
export async function fetchWikipediaImage(title: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | null> {
  if (!title) return null;
  try {
    const headers = { "User-Agent": "DayQuest/0.1 (hackathon project)" };
    const summary = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!summary.ok) return null;
    const json = (await summary.json()) as { originalimage?: { source?: string }; thumbnail?: { source?: string } };
    const src = json.originalimage?.source || json.thumbnail?.source;
    if (!src || !/^https:\/\/upload\.wikimedia\.org\//.test(src)) return null;
    const image = await fetchImpl(src, { headers, signal: AbortSignal.timeout(15000) });
    if (!image.ok || Number(image.headers.get("content-length")) > MAX_BYTES) return null;
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    return await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}
