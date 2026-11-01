import * as Phaser from "phaser";
import { resolveDayAsset, type DayManifest } from "@/lib/day";
import { TILE, VIEW_H, VIEW_W } from "../maps";
import { FONT } from "../ui/TextBox";

export const landmarkKey = (scene: number, slot: number) => `s${scene}_l${slot}`;
export const foodKey = (scene: number) => `s${scene}_food`;
export const foodIconKey = (scene: number) => `s${scene}_food_icon`;

/** Loads the day's art (relative to day.json), the generated tile atlas and the static transit art. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    const manifest = this.registry.get("manifest") as DayManifest;
    const manifestUrl = this.registry.get("manifestUrl") as string;
    const text = this.add.text(VIEW_W / 2, VIEW_H / 2 - 8, "LOADING", { fontFamily: FONT, fontSize: "8px", color: "#f6f1df" }).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on("progress", (p: number) => {
      bar.clear().fillStyle(0xf6f1df, 1).fillRect(VIEW_W / 2 - 50, VIEW_H / 2 + 4, 100 * p, 6).lineStyle(1, 0xf6f1df, 1).strokeRect(VIEW_W / 2 - 50, VIEW_H / 2 + 4, 100, 6);
    });
    this.load.on("loaderror", (file: Phaser.Loader.File) => text.setText(`MISSING ${file.key}`));

    this.load.spritesheet("tiles", "/tiles/dq-atlas.png", { frameWidth: TILE, frameHeight: TILE });
    this.load.image("tree", "/tiles/dq/tree.png");
    this.load.image("player", resolveDayAsset(manifest.player.sprite, manifestUrl));
    manifest.scenes.forEach((scene, i) => {
      if (scene.skyline) this.load.image(`s${i}_skyline`, resolveDayAsset(scene.skyline, manifestUrl));
      for (const landmark of scene.landmarks) this.load.image(landmarkKey(i, landmark.slot), resolveDayAsset(landmark.sprite, manifestUrl));
      if (scene.food) {
        this.load.image(foodKey(i), resolveDayAsset(scene.food.sprite, manifestUrl));
        if (scene.food.icon) this.load.image(foodIconKey(i), resolveDayAsset(scene.food.icon, manifestUrl));
      }
    });
    for (const name of ["bus", "tube", "city", "nelson"]) this.load.image(`transit_${name}`, `/transit/${name}.png`);
  }

  create() {
    const shadow = this.make.graphics({ x: 0, y: 0 }, false);
    shadow.fillStyle(0x000000, 0.28).fillEllipse(16, 4, 30, 8);
    shadow.generateTexture("shadow", 32, 8);
    shadow.destroy();
    this.scene.start("Highlight", { index: 0 });
  }
}
