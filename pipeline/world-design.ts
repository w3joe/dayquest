import { INTERACT_EFFECTS, MAX_NPC_LINES, MAX_ROAM_PX, type InteractEffect } from "../lib/day";
import { ACTOR_LIBRARY, actorById, type Ground } from "../lib/actor-library";
import type { SceneBlueprint } from "./scene-types";

/** What a designer (agent or fallback) proposes. Positions are NOT part of it: placement is deterministic code. */
/** `near` is a building id or zone id from the world context; placement resolves it to a real spot. */
export type DesignInteractable = { id: string; name: string; library?: string; description?: string; effect: InteractEffect; text: string; near?: string };
export type DesignNpc = { id: string; name: string; library?: string; description?: string; text: string; lines: string[]; roam: number; near?: string };
export type WorldDesign = { interactables: DesignInteractable[]; npcs: DesignNpc[]; source: "agent" | "fallback" };

export const WANTED_INTERACTABLES = 3;
export const MAX_NPCS = 3;
const ID = /^[a-z0-9_]{1,40}$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Hand-written sets per ground. Warm, short, and free of factual claims about the place, so they are always safe to ship.
 * This is also the fallback when an agent fails or produces something the validator rejects.
 */
export function fallbackDesign(ground: Ground): WorldDesign {
  const sets: Record<Ground, Omit<WorldDesign, "source">> = {
    street: {
      interactables: [
        { id: "crossing_button", name: "Crossing button", library: "crossing_button", effect: "press_button", text: "You press the crossing button. A tiny beep, and everything feels a little more orderly.", near: "crossing_south" },
        { id: "little_bell", name: "Little bell", library: "bell", effect: "ring", text: "Ding! The bell rings out down the street.", near: "north_pavement" },
        { id: "bench", name: "Bench", library: "bench", effect: "sit", text: "A good bench for watching the world go by. You sit for a moment.", near: "west_verge" },
      ],
      npcs: [
        { id: "dog_walker", name: "Dog walker", library: "dog_walker", text: "Hello! Lovely day for a wander, isn't it?", lines: ["He pulls me everywhere, but I wouldn't swap him."], roam: 20, near: "south_pavement" },
        { id: "pigeon", name: "Pigeon", library: "pigeon", text: "Coo.", lines: ["Coo coo."], roam: 12, near: "crossing_north" },
      ],
    },
    park: {
      interactables: [
        { id: "bench", name: "Bench", library: "bench", effect: "sit", text: "You sit and let the park carry on around you.", near: "west_verge" },
        { id: "bird_feeder", name: "Bird feeder", library: "bird_feeder", effect: "feed", text: "You scatter a few seeds. Small wings arrive almost at once.", near: "east_verge" },
        { id: "leaf_pile", name: "Pile of leaves", library: "leaf_pile", effect: "shake_leaves", text: "You kick the leaves into the air and they come down like confetti.", near: "west_verge" },
      ],
      npcs: [
        { id: "jogger", name: "Jogger", library: "jogger", text: "Morning! Nearly done my loop.", lines: ["Worth it for the view."], roam: 24, near: "south_pavement" },
        { id: "cat", name: "Cat", library: "cat", text: "Mrrp.", lines: ["Purrrr."], roam: 8, near: "south_plaza" },
      ],
    },
    plaza: {
      interactables: [
        { id: "wishing_well", name: "Wishing well", library: "wishing_well", effect: "ring", text: "You drop a coin and make a small, quiet wish.", near: "south_plaza" },
        { id: "lantern", name: "Lantern", library: "lantern", effect: "toggle_lamp", text: "You light the lantern. It glows warm against the day.", near: "north_pavement" },
        { id: "bench", name: "Bench", library: "bench", effect: "sit", text: "You rest for a while and watch people cross the square.", near: "east_verge" },
      ],
      npcs: [
        { id: "busker", name: "Busker", library: "busker", text: "Requests? I only know three songs, but I play them well.", lines: ["Thanks for stopping to listen."], roam: 10, near: "crossing_south" },
        { id: "tourist", name: "Visitor", library: "tourist", text: "Could you take my photo? Just here is perfect.", lines: ["Thank you! That's one for the album."], roam: 16, near: "north_pavement" },
      ],
    },
  };
  return { ...sets[ground], source: "fallback" };
}

export type DesignIssue = string;

/** Strict gate for anything an agent returns. Returns a cleaned design or the reasons it was rejected. */
export function validateDesign(raw: unknown, ground: Ground, anchors?: string[]): { ok: true; design: WorldDesign } | { ok: false; issues: DesignIssue[] } {
  const issues: DesignIssue[] = [];
  const r = (raw ?? {}) as { interactables?: unknown; npcs?: unknown };
  const used = new Set<string>();
  const unique = (id: string, what: string) => { if (!ID.test(id)) issues.push(`${what}: bad id "${id}"`); if (used.has(id)) issues.push(`${what}: duplicate id "${id}"`); used.add(id); };
  const library = (what: string, id: string | undefined, role: "npc" | "interactable") => {
    if (id === undefined) return;
    const found = actorById(id);
    if (!found || found.role !== role) issues.push(`${what}: library sprite "${id}" is not a ${role}`);
    else if (!found.grounds.includes(ground)) issues.push(`${what}: "${id}" does not suit a ${ground} scene`);
  };

  const interactables: DesignInteractable[] = (Array.isArray(r.interactables) ? r.interactables : []).slice(0, 6).map((v: Record<string, unknown>) => ({
    id: clean(v.id, 40), name: clean(v.name, 40), library: typeof v.library === "string" && v.library ? v.library : undefined, description: clean(v.description, 300) || undefined,
    effect: v.effect as InteractEffect, text: clean(v.text, 220), near: clean(v.near, 40) || undefined,
  }));
  if (interactables.length !== WANTED_INTERACTABLES) issues.push(`need exactly ${WANTED_INTERACTABLES} interactables, got ${interactables.length}`);
  for (const item of interactables) {
    unique(item.id, "interactable");
    if (!item.name || !item.text) issues.push(`interactable ${item.id}: name and text are required`);
    if (!(INTERACT_EFFECTS as readonly string[]).includes(item.effect)) issues.push(`interactable ${item.id}: unknown effect "${String(item.effect)}"`);
    library("interactable " + item.id, item.library, "interactable");
    if (!item.library && !item.description) issues.push(`interactable ${item.id}: no library sprite, so a description is required to generate one`);
    const lib = item.library ? actorById(item.library) : undefined;
    if (lib?.effects && !lib.effects.includes(item.effect)) issues.push(`interactable ${item.id}: effect "${item.effect}" does not suit ${lib.id}`);
  }
  if (new Set(interactables.map((i) => i.effect)).size < 2) issues.push("interactables should not all use the same effect");

  const npcs: DesignNpc[] = (Array.isArray(r.npcs) ? r.npcs : []).slice(0, 6).map((v: Record<string, unknown>) => ({
    id: clean(v.id, 40), name: clean(v.name, 40), library: typeof v.library === "string" && v.library ? v.library : undefined, description: clean(v.description, 300) || undefined,
    text: clean(v.text, 220), lines: (Array.isArray(v.lines) ? v.lines : []).slice(0, MAX_NPC_LINES).map((l) => clean(l, 220)).filter(Boolean),
    roam: Math.max(0, Math.min(MAX_ROAM_PX, Math.round(Number(v.roam) || 0))), near: clean(v.near, 40) || undefined,
  }));
  if (npcs.length < 1 || npcs.length > MAX_NPCS) issues.push(`need 1 to ${MAX_NPCS} NPCs, got ${npcs.length}`);
  for (const npc of npcs) {
    unique(npc.id, "npc");
    if (!npc.name || !npc.text) issues.push(`npc ${npc.id}: name and text are required`);
    library("npc " + npc.id, npc.library, "npc");
    if (!npc.library && !npc.description) issues.push(`npc ${npc.id}: no library sprite, so a description is required to generate one`);
  }
  if (anchors) for (const item of [...interactables, ...npcs]) if (item.near && !anchors.includes(item.near)) issues.push(`${item.id}: "near" must be one of the building or zone ids, got "${item.near}"`);
  // Keep the tone safe and kind: no shouting, links, or contact details in anything a stranger will read.
  for (const t of [...interactables.map((i) => i.text), ...npcs.flatMap((n) => [n.text, ...n.lines])]) {
    if (/https?:\/\/|www\.|@\w+\.\w+|\b\d{6,}\b/i.test(t)) issues.push("text contains a link or contact detail");
    if (t.length > 8 && t === t.toUpperCase()) issues.push("text is all capitals");
  }
  return issues.length ? { ok: false, issues } : { ok: true, design: { interactables, npcs, source: "agent" } };
}

export const designGround = (blueprint: Pick<SceneBlueprint, "ground">): Ground => blueprint.ground;
export const libraryIds = () => ACTOR_LIBRARY.map((a) => a.id);
