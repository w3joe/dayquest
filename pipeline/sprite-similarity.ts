import sharp from "sharp";

/** A 64-bit perceptual hash (difference hash) of a sprite flattened onto white, as 16 hex characters. Near-identical drawings hash within a few bits. */
export async function spriteHash(png: Buffer): Promise<string> {
  const { data } = await sharp(png).flatten({ background: "#ffffff" }).greyscale().resize(9, 8, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}
export function hashDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  for (; x > 0n; x >>= 1n) n += Number(x & 1n);
  return n;
}
/** Buildings drawn from different subjects differ by 20+ bits; copies of one picture differ by a handful. */
export const DUPLICATE_BITS = 10;
export const looksDuplicate = (hash: string, others: Record<string, string> | undefined) => Object.values(others ?? {}).some((h) => hashDistance(hash, h) <= DUPLICATE_BITS);
