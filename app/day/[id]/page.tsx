import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayViewer } from "@/components/day/DayViewer";
import { generatedManifestUrl, isDayId, parseDayManifest } from "@/lib/day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDayId(id)) notFound();

  let manifest;
  let manifestUrl;
  try {
    // Local dev without Blob: B's pipeline writes generated days to public/days/<id>/ too.
    if (id === "demo" || (!process.env.BLOB_BASE_URL && process.env.NODE_ENV !== "production")) {
      manifestUrl = `/days/${id}/day.json`;
      const raw = await readFile(path.join(process.cwd(), "public", "days", id, "day.json"), "utf8");
      manifest = parseDayManifest(JSON.parse(raw), id);
    } else {
      if (!process.env.BLOB_BASE_URL) throw new Error("Blob base URL is not configured");
      manifestUrl = generatedManifestUrl(id, process.env.BLOB_BASE_URL);
      const response = await fetch(manifestUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Day manifest is unavailable");
      const raw = await response.text();
      if (raw.length > 1024 * 1024) throw new Error("Day manifest is too large");
      manifest = parseDayManifest(JSON.parse(raw), id);
    }
  } catch {
    return <main className="day-unavailable"><p className="eyebrow">DAYQUEST / SHARED DAY</p><h1>This day is not ready to visit.</h1><p>The world may still be generating, or this link is no longer available. Try again shortly.</p><p><Link href={`/day/${id}`}>Try again</Link> · <Link href="/">Back to Today</Link></p></main>;
  }
  return <DayViewer manifest={manifest} manifestUrl={manifestUrl} />;
}
