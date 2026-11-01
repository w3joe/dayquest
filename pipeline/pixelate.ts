import sharp from "sharp";
import { RequestError } from "../lib/server/errors";

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
    .png({ palette: true, colours: 16, dither: 0 }).toBuffer();
}

export function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** The renderer reads these cells without guessing frame order or dimensions. */
export const WALK_SHEET = { width: 96, height: 192, columns: 3, rows: 4, cellWidth: 32, cellHeight: 48, directions: ["down", "left", "right", "up"] } as const;

type Bounds = { left: number; top: number; width: number; height: number };

function visibleBounds(data: Buffer, width: number, height: number): Bounds | null {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function transparentPixels(bytes: Buffer) {
  const source = sharp(bytes, { limitInputPixels: 20_000_000 });
  const metadata = await source.metadata();
  if (!metadata.hasAlpha) throw new RequestError("The generated artwork was missing transparency. Please retry this asset.", 502);
  const decoded = await source.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let i = 3; i < decoded.data.length; i += 4) {
    decoded.data[i] = decoded.data[i] < 128 ? 0 : 255;
    if (decoded.data[i]) visible++;
  }
  if (!visible || visible === decoded.info.width * decoded.info.height) {
    throw new RequestError("The generated artwork did not have a usable transparent background. Please retry this asset.", 502);
  }
  return decoded;
}

/** Strict isolated sprites: no opaque/empty model outputs can become saved assets. */
export async function pixelateSceneSprite(bytes: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await transparentPixels(bytes);
  const bounds = visibleBounds(data, info.width, info.height)!;
  const sprite = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(bounds).resize(width, height, { fit: "contain", position: "south", kernel: "nearest", background: "#00000000" })
    .raw().toBuffer();
  return sharp(sprite, { raw: { width, height, channels: 4 } }).png({ palette: true, colours: 16, dither: 0 }).toBuffer();
}

/**
 * Slice before trimming. A sheet-wide trim/resize loses cell boundaries and makes
 * the character jump. One shared scale and foot baseline preserves animation.
 */
export async function pixelateWalkSheet(bytes: Buffer): Promise<Buffer> {
  const { data, info } = await transparentPixels(bytes);
  if (info.width < 96 || info.height < 192) throw new RequestError("The walking sheet is too small. Please retry this asset.", 502);
  const cells: { pixels: Buffer; width: number; height: number; bounds: Bounds }[] = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 3; column++) {
    const left = Math.floor(column * info.width / 3), top = Math.floor(row * info.height / 4);
    const width = Math.floor((column + 1) * info.width / 3) - left;
    const height = Math.floor((row + 1) * info.height / 4) - top;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) data.copy(pixels, y * width * 4, ((top + y) * info.width + left) * 4, ((top + y) * info.width + left + width) * 4);
    const bounds = visibleBounds(pixels, width, height);
    if (!bounds || bounds.width < width * 0.08 || bounds.height < height * 0.25
      || bounds.left === 0 || bounds.top === 0 || bounds.left + bounds.width >= width || bounds.top + bounds.height >= height) {
      throw new RequestError("The walking sheet has an empty or clipped frame. Please retry this asset.", 502);
    }
    cells.push({ pixels, width, height, bounds });
  }
  const maxWidth = Math.max(...cells.map(({ bounds }) => bounds.width));
  const maxHeight = Math.max(...cells.map(({ bounds }) => bounds.height));
  if (cells.some(({ bounds }) => bounds.height < maxHeight * 0.65 || bounds.width < maxWidth * 0.35)) {
    throw new RequestError("The walking sheet has inconsistent character frames. Please retry this asset.", 502);
  }
  const scale = Math.min(28 / maxWidth, 44 / maxHeight);
  const frames = await Promise.all(cells.map(async (cell, index) => {
    const width = Math.max(1, Math.round(cell.bounds.width * scale));
    const height = Math.max(1, Math.round(cell.bounds.height * scale));
    const input = await sharp(cell.pixels, { raw: { width: cell.width, height: cell.height, channels: 4 } })
      .extract(cell.bounds).resize(width, height, { kernel: "nearest" }).png().toBuffer();
    return { input, left: (index % 3) * 32 + Math.floor((32 - width) / 2), top: Math.floor(index / 3) * 48 + 46 - height };
  }));
  return sharp({ create: { width: 96, height: 192, channels: 4, background: "#00000000" } })
    .composite(frames).png({ palette: true, colours: 16, dither: 0 }).toBuffer();
}
