import sharp from "sharp";

/** §5.4 fixed target sizes. Never let the model decide size. */
export const TARGETS = {
  S: { width: 48, height: 48 },
  M: { width: 64, height: 64 },
  L: { width: 80, height: 64 },
  food: { width: 16, height: 16 },
  foodIcon: { width: 32, height: 32 },
  player: { width: 32, height: 48 },
} as const;
export type PixelTarget = keyof typeof TARGETS;

/**
 * Trim → nearest-neighbour fit (anchored bottom-centre so buildings sit on the ground)
 * → binary alpha → ≤32-colour palette PNG.
 */
export async function pixelate(bytes: Buffer, target: PixelTarget): Promise<Buffer> {
  const { width, height } = TARGETS[target];
  let source = sharp(bytes, { limitInputPixels: 20_000_000 }).ensureAlpha();
  try {
    source = sharp(await source.clone().trim({ background: "#00000000", threshold: 1 }).png().toBuffer());
  } catch {
    // Fully transparent or untrimmable input: keep as is.
  }
  const { data, info } = await source
    .resize(width, height, { fit: "contain", position: "south", kernel: "nearest", background: "#00000000" })
    .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels) data[i] = data[i] < 128 ? 0 : 255;
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ palette: true, colours: 32, dither: 0 }).toBuffer();
}

export function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
