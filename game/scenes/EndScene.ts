import * as Phaser from "phaser";
import type { DayManifest } from "@/lib/day";
import { VIEW_H, VIEW_W } from "../maps";
import { FONT } from "../ui/TextBox";

/** End card after the last highlight, with a Share button that copies `location.href`. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super("End");
  }

  create() {
    const manifest = this.registry.get("manifest") as DayManifest;
    this.cameras.main.setBackgroundColor("#1f1a2e").fadeIn(400, 0, 0, 0);
    const style = { fontFamily: FONT, fontSize: "8px", color: "#f6f1df", lineSpacing: 8, align: "center" } as const;
    this.add.text(VIEW_W / 2, 28, "THE END", { ...style, fontSize: "16px" }).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 52, `${manifest.player.name}'S DAY · ${manifest.date}`, style).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 80, manifest.scenes.map((s) => `${s.time}  ${s.title.toUpperCase()}`).join("\n"), style).setOrigin(0.5, 0);
    this.add.image(VIEW_W / 2, 200, "player").setOrigin(0.5, 1).setScale(1);

    const button = this.add.text(VIEW_W / 2, 208, " SHARE ", { ...style, backgroundColor: "#3f7d4c", padding: { x: 8, y: 6 } }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    const status = this.add.text(VIEW_W / 2, 231, "", { ...style, fontSize: "6px", color: "#a99fcf" }).setOrigin(0.5);
    const share = async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        status.setText("LINK COPIED");
      } catch {
        status.setText(window.location.href.slice(0, 48));
      }
    };
    button.on("pointerdown", share);
    this.input.keyboard!.on("keydown-SPACE", share);
    this.input.keyboard!.on("keydown-ENTER", share);
  }
}
