import type { DayManifest } from "./day";

/** Canonical JSON makes equivalent object-key order share a scope; array order stays meaningful. */
function canonicalManifest(manifest: DayManifest): string {
  const value = JSON.stringify(manifest, (_key, item: unknown) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return item;
  });
  if (typeof value !== "string") throw new Error("Game progress needs a serializable day manifest");
  return value;
}

/**
 * Browser-safe revision scope for BOTH journey and interaction progress. Compute once per game.
 * This 64-bit FNV-1a checksum distinguishes content revisions; it is not an authentication token.
 * It uses no server imports or secure-context APIs, so HTTP development devices work too.
 */
export function dayProgressScope(manifest: DayManifest): string {
  let checksum = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalManifest(manifest))) {
    checksum = BigInt.asUintN(64, (checksum ^ BigInt(byte)) * 0x100000001b3n);
  }
  return `v1:${manifest.id}:${checksum.toString(16).padStart(16, "0")}`;
}
