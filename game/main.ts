import * as Phaser from "phaser";
import { GridEngine } from "grid-engine";
import type { DayManifest } from "@/lib/day";
import { VIEW_H, VIEW_W } from "./maps";
import { BootScene } from "./scenes/BootScene";
import { EndScene } from "./scenes/EndScene";
import { HighlightScene } from "./scenes/HighlightScene";
import { TransitScene } from "./scenes/TransitScene";

export type GameHandle = { destroy: () => void };

async function loadFont() {
  if (document.fonts.check("8px PressStart2P")) return;
  try {
    const face = new FontFace("PressStart2P", "url(/fonts/PressStart2P.ttf)");
    document.fonts.add(await face.load());
  } catch {
    // Falls back to monospace; the game still plays.
  }
}

/** Integer zoom keeps every logical pixel the same size on screen. */
function pickZoom(parent: HTMLElement) {
  return Math.max(1, Math.min(4, Math.floor(parent.clientWidth / VIEW_W)));
}

export async function createGame(parent: HTMLElement, manifest: DayManifest, manifestUrl: string): Promise<GameHandle> {
  await loadFont();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: "#1f1a2e",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom: pickZoom(parent) },
    plugins: { scene: [{ key: "gridEngine", plugin: GridEngine, mapping: "gridEngine" }] },
    scene: [BootScene, HighlightScene, TransitScene, EndScene],
    callbacks: { preBoot: (g) => { g.registry.set("manifest", manifest); g.registry.set("manifestUrl", manifestUrl); } },
  });
  return { destroy: () => game.destroy(true) };
}
