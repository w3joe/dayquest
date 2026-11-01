import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseInteractionCatalog, type InteractionCatalog } from "../interactions";

/** Bump when the interpretation or generated instruction schema changes. */
export const INTERACTION_PLANNER_VERSION = 2;

export function interactionCatalogFingerprint(bytes: string): string {
  return createHash("sha256").update(`interaction-planner:${INTERACTION_PLANNER_VERSION}\n`).update(bytes).digest("hex");
}

/** Fixed project configuration, never catalogue entries supplied by a browser or model. */
export function loadInteractionCatalog(): { catalog: InteractionCatalog; fingerprint: string } {
  const bytes = readFileSync(path.join(process.cwd(), "data", "interaction-catalog.json"), "utf8");
  const catalog = parseInteractionCatalog(JSON.parse(bytes));
  for (const asset of catalog.assets) {
    if (!asset.src.startsWith("/interactions/library/")) throw new Error("Interaction catalogue assets must use /interactions/library/ paths.");
    if (!existsSync(path.join(process.cwd(), "public", asset.src))) throw new Error("A configured interaction asset is missing from public/interactions/library/.");
  }
  return { catalog, fingerprint: interactionCatalogFingerprint(bytes) };
}
