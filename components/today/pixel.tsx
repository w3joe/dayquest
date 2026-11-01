const PALETTE: Record<string, string> = {
  k: "#5b4a5f", o: "#ffd9b8", w: "#fffdf8", p: "#ffb3c6", e: "#5b4a5f", c: "#ffa0b8",
  y: "#ffd966", r: "#ff8fae", b: "#a9d0ea", d: "#c8a27a", g: "#7fc4a0", s: "#d9eefb",
};

const ART = {
  speaker: ["...k.....", "..kk..k..", "kkkk...k.", "kkkk...k.", "kkkk...k.", "..kk..k..", "...k....."],
  muted: ["...k.....", "..kk.r.r.", "kkkk..r..", "kkkk.r.r.", "kkkk.....", "..kk.....", "...k....."],
  camera: ["...kkk.....", "kkkkkkkkkkk", "kbbbkkkbbbk", "kbbkwwwkbbk", "kbbkwkwkbbk", "kbbkwwwkbbk", "kbbbkkkbbbk", "kbbbbbbbbbk", "kkkkkkkkkkk"],
  pin: ["..kkkkk..", ".krrrrrk.", "krrwwwrrk", "krrwwwrrk", "krrrrrrrk", ".krrrrrk.", ".krrrrrk.", "..krrrk..", "..krrrk..", "...krk...", "....k...."],
} as const;

/** Generated 64px pixel-art sprites in public/ui (see scripts/generate-ui-sprites.mts). */
const IMAGES = ["shirt", "food", "landmark", "face", "cat", "cloud", "flower", "heart", "star"] as const;

export type SpriteName = keyof typeof ART | (typeof IMAGES)[number];
const isImage = (name: SpriteName): name is (typeof IMAGES)[number] => (IMAGES as readonly string[]).includes(name);

/** Sprite at `size` × 16px (images) or × 1 art-pixel (icons). */
export default function PixelSprite({ name, size = 4, className }: { name: SpriteName; size?: number; className?: string }) {
  if (isImage(name)) return <img src={`/ui/${name}.png`} width={size * 16} height={size * 16} alt="" aria-hidden="true" decoding="async" className={className} />;
  const rows: readonly string[] = ART[name];
  const width = Math.max(...rows.map(row => row.length));
  const paths: Record<string, string> = {};
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PALETTE[ch]) paths[ch] = `${paths[ch] ?? ""}M${x} ${y}h1v1h-1z`; }));
  return <svg className={className} width={width * size} height={rows.length * size} viewBox={`0 0 ${width} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
    {Object.entries(paths).map(([ch, d]) => <path key={ch} d={d} fill={PALETTE[ch]} />)}
  </svg>;
}
