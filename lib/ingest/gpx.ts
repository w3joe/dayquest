import { haversineM } from "./time";

export type GpxTrack = { name?: string; type?: string; start: string; end: string; distanceKm: number; durationMin: number; points: { lat: number; lng: number }[] };

/** Parses every <trk> in a GPX file. Distance is the haversine sum of consecutive points; duration is first→last timestamp. */
export function parseGpx(xml: string): GpxTrack[] {
  if (!/<gpx\b/.test(xml)) throw new Error("This does not look like a GPX file.");
  const tracks: GpxTrack[] = [];
  for (const trk of xml.matchAll(/<trk\b[\s\S]*?<\/trk>/g)) {
    const pts = [...trk[0].matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)].flatMap((m) => {
      const lat = m[1].match(/lat="([^"]+)"/), lon = m[1].match(/lon="([^"]+)"/), time = m[2].match(/<time>([^<]+)<\/time>/);
      return lat && lon && time ? [{ lat: Number(lat[1]), lng: Number(lon[1]), time: time[1] }] : [];
    });
    if (pts.length < 2) continue;
    let metres = 0;
    for (let i = 1; i < pts.length; i++) metres += haversineM(pts[i - 1], pts[i]);
    const start = pts[0].time, end = pts[pts.length - 1].time;
    tracks.push({ name: trk[0].match(/<name>([^<]*)<\/name>/)?.[1], type: trk[0].match(/<type>([^<]*)<\/type>/)?.[1]?.toLowerCase(), start, end,
      distanceKm: Math.round(metres / 100) / 10, durationMin: Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000), points: pts.map(({ lat, lng }) => ({ lat, lng })) });
  }
  if (!tracks.length) throw new Error("The GPX file has no track with timed points.");
  return tracks;
}
