/** Offline helper: prepares three private photos for the end-to-end world run. Output goes to .data/e2e/ (git-ignored). No network. */
import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as exifr from "exifr";
// Under tsx/ESM the CJS build exposes its API on `default`.
const parse = (exifr as unknown as { parse?: typeof exifr.parse; default?: { parse: typeof exifr.parse } }).parse ?? (exifr as unknown as { default: { parse: typeof exifr.parse } }).default.parse;

const outDir = path.join(process.cwd(), ".data", "e2e");
const MAX_BYTES = 3.5 * 1024 * 1024, HARD_LIMIT = 4 * 1024 * 1024;
const photos = [
  { kind: "landmark", src: "/home/lucas/.paseo/uploads/upload_7e56f9e9-65ae-4b9d-ae5d-11932ef9aca1/PHOTO-2026-11-01-14-28-47.jpg", when: "2026:11:07 15:20:00", lat: 51.5007, lon: -0.1246 },
  { kind: "lunch", src: "/home/lucas/.paseo/uploads/upload_0be88037-e2f5-4806-a654-da02f86f3756/PHOTO-2026-11-01-14-06-44.jpg", when: "2026:11:07 12:55:00", lat: 51.5157, lon: -0.1281 },
  { kind: "tea", src: "/home/lucas/.paseo/uploads/upload_0638484b-739a-4764-87f4-e7adf54f56b1/PHOTO-2026-11-01-14-08-05.jpg", when: "2026:11:07 16:40:00", lat: 51.5113, lon: -0.1311 },
];

/** Decimal degrees to EXIF rational triple, e.g. "51/1 30/1 2520/100". */
function dms(value: number): string {
  const abs = Math.abs(value);
  const d = Math.floor(abs), m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 100);
  return `${d}/1 ${m}/1 ${s}/100`;
}

await mkdir(outDir, { recursive: true });
console.log(`git check-ignore .data/e2e/x -> ${(() => { try { return execFileSync("git", ["check-ignore", ".data/e2e/x"], { encoding: "utf8" }).trim() || "(not ignored)"; } catch { return "(NOT IGNORED)"; } })()}`);

const rows: string[][] = [];
let failed = false;
const fail = (why: string) => { failed = true; console.error(`FAIL: ${why}`); };

for (const p of photos) {
  const target = path.join(outDir, `${p.kind}.jpg`);
  let bytes!: Buffer;
  for (const quality of [88, 82, 76, 70, 62, 55, 48, 40]) {
    bytes = await sharp(p.src).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .withExif({
        IFD2: { DateTimeOriginal: p.when },
        IFD3: {
          GPSLatitudeRef: p.lat >= 0 ? "N" : "S", GPSLatitude: dms(p.lat),
          GPSLongitudeRef: p.lon >= 0 ? "E" : "W", GPSLongitude: dms(p.lon),
        },
      })
      .jpeg({ quality }).toBuffer();
    if (bytes.length < MAX_BYTES) break;
  }
  await writeFile(target, bytes);
  const size = (await stat(target)).size;
  const info = await sharp(target).metadata();
  const tags = await parse(target, { gps: true, exif: true, tiff: true }).catch(() => null) as { DateTimeOriginal?: Date; latitude?: number; longitude?: number } | null;
  const date = tags?.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : undefined;
  // exifr returns local-time Dates; compare on local components.
  const got = date ? `${date.getFullYear()}:${String(date.getMonth() + 1).padStart(2, "0")}:${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}` : "missing";
  if (size > HARD_LIMIT) fail(`${p.kind} is over 4 MB`);
  if (info.format !== "jpeg") fail(`${p.kind} is not JPEG`);
  if (got !== p.when) fail(`${p.kind} DateTimeOriginal did not round-trip (${got})`);
  if (tags?.latitude === undefined || Math.abs(tags.latitude - p.lat) > 0.0005) fail(`${p.kind} latitude did not round-trip (${tags?.latitude})`);
  if (tags?.longitude === undefined || Math.abs(tags.longitude - p.lon) > 0.0005) fail(`${p.kind} longitude did not round-trip (${tags?.longitude})`);
  rows.push([p.kind, `${info.width}x${info.height}`, String(Math.round(size / 1024)), got, `${tags?.latitude?.toFixed(4)}, ${tags?.longitude?.toFixed(4)}`]);
}

const header = ["kind", "dimensions", "KB", "DateTimeOriginal", "lat, lon"];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
for (const r of [header, ...rows]) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
if (failed) process.exit(1);
console.log(`Wrote ${rows.length} files to ${outDir}`);
