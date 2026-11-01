// Rewrites the capture time and GPS of your own photos so they sit on the synthetic demo route.
//   npx tsx scripts/restamp-photos.mts <folder-of-photos>
// Writes copies to <folder>/restamped/ and never modifies the originals. Pixels are untouched; EXIF is replaced.
// Assignment: filename keywords first (ramen|lunch|food, park|garden|rose, eye|wheel, bigben|westminster|bridge|tower),
// then remaining photos fill the remaining stops in file-name order. Files named fit|outfit|selfie are copied unchanged.
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DATE = "2026-11-07";
const SLOTS = [
  { key: "westminster", match: /bigben|big_ben|westminster|bridge|tower|parliament/i, t: "10:20", lat: 51.5009, lng: -0.122 },
  { key: "eye", match: /eye|wheel|thames|river/i, t: "11:10", lat: 51.5033, lng: -0.1196 },
  { key: "ramen", match: /ramen|lunch|food|noodle|gyoza|meal/i, t: "12:55", lat: 51.5157, lng: -0.1281 },
  { key: "park", match: /park|garden|rose|fountain|lake|swan/i, t: "14:30", lat: 51.5268, lng: -0.153 },
];
const dms = (v: number) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 1000); return `${d}/1 ${m}/1 ${s}/1000`; };

const dir = process.argv[2];
if (!dir) { console.error("Usage: npx tsx scripts/restamp-photos.mts <folder-of-photos>"); process.exit(1); }
const out = path.join(dir, "restamped");
await mkdir(out, { recursive: true });

const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const skipped = (await readdir(dir)).filter((f) => /\.(heic|heif)$/i.test(f));
if (skipped.length) console.warn(`HEIC/HEIF is not supported here, convert these to JPEG first: ${skipped.join(", ")}`);

const free = new Set(SLOTS.map((s) => s.key));
const plan = new Map<string, (typeof SLOTS)[number]>();
const personal = (f: string) => /fit|outfit|selfie|me\./i.test(f);
for (const f of files) {
  if (personal(f)) continue;
  const slot = SLOTS.find((s) => free.has(s.key) && s.match.test(f));
  if (slot) { plan.set(f, slot); free.delete(slot.key); }
}
for (const f of files) {
  if (personal(f) || plan.has(f)) continue;
  const slot = SLOTS.find((s) => free.has(s.key));
  if (slot) { plan.set(f, slot); free.delete(slot.key); }
}

for (const f of files) {
  const slot = plan.get(f);
  if (!slot) { await copyFile(path.join(dir, f), path.join(out, f)); console.log(`${f}: copied unchanged${personal(f) ? " (personal photo)" : " (no free stop left)"}`); continue; }
  const exif = { IFD2: { DateTimeOriginal: `${DATE.replaceAll("-", ":")} ${slot.t}:00` },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: dms(slot.lat), GPSLongitudeRef: "W", GPSLongitude: dms(slot.lng) } };
  const image = sharp(await readFile(path.join(dir, f))).rotate().withExif(exif);
  const ext = path.extname(f).toLowerCase();
  await (ext === ".png" ? image.png() : ext === ".webp" ? image.webp() : image.jpeg({ quality: 92 })).toFile(path.join(out, f));
  console.log(`${f}: ${slot.key} at ${slot.t} (${slot.lat}, ${slot.lng})`);
}
console.log(`\nWrote ${files.length} file(s) to ${out}. Upload these instead of the originals.`);
