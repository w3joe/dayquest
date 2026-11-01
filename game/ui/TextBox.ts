import * as Phaser from "phaser";
import { VIEW_H, VIEW_W } from "../maps";

export const FONT = "PressStart2P, monospace";
const CHARS_PER_SECOND = 40;

/** Bottom dialogue box with a typewriter effect. Space/Enter completes the line, then closes it. */
export class TextBox {
  private box: Phaser.GameObjects.Container;
  private label: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private arrow: Phaser.GameObjects.Text;
  private full = "";
  private shown = 0;
  private timer?: Phaser.Time.TimerEvent;
  open = false;

  constructor(private scene: Phaser.Scene) {
    const w = VIEW_W - 16;
    const h = 56;
    const g = scene.add.graphics();
    g.fillStyle(0x1f1a2e, 1).fillRect(0, 0, w, h);
    g.lineStyle(2, 0xf6f1df, 1).strokeRect(1, 1, w - 2, h - 2);
    g.lineStyle(1, 0x7a6fa8, 1).strokeRect(4, 4, w - 8, h - 8);
    this.label = scene.add.text(12, 10, "", { fontFamily: FONT, fontSize: "8px", color: "#f6f1df", lineSpacing: 6, wordWrap: { width: w - 28 } });
    this.arrow = scene.add.text(w - 14, h - 14, "▼", { fontFamily: FONT, fontSize: "8px", color: "#f6f1df" }).setVisible(false);
    this.box = scene.add.container(8, VIEW_H - h - 8, [g, this.label, this.arrow]).setDepth(10_000).setVisible(false).setScrollFactor(0);
    scene.tweens.add({ targets: this.arrow, y: this.arrow.y + 2, yoyo: true, repeat: -1, duration: 300 });
  }

  show(text: string, iconKey?: string) {
    this.icon?.destroy();
    this.icon = undefined;
    const left = iconKey ? 52 : 12;
    if (iconKey) {
      this.icon = this.scene.add.image(10, 12, iconKey).setOrigin(0).setDisplaySize(32, 32);
      this.box.add(this.icon);
    }
    this.label.setPosition(left, 10).setWordWrapWidth(VIEW_W - 16 - left - 16);
    this.full = text;
    this.shown = 0;
    this.label.setText("");
    this.arrow.setVisible(false);
    this.box.setVisible(true);
    this.open = true;
    this.timer?.remove();
    this.timer = this.scene.time.addEvent({
      delay: 1000 / CHARS_PER_SECOND,
      repeat: text.length - 1,
      callback: () => this.advanceChar(),
    });
  }

  private advanceChar() {
    this.shown += 1;
    this.label.setText(this.full.slice(0, this.shown));
    if (this.shown >= this.full.length) this.arrow.setVisible(true);
  }

  /** Returns true if the box consumed the key press. */
  confirm(): boolean {
    if (!this.open) return false;
    if (this.shown < this.full.length) {
      this.timer?.remove();
      this.shown = this.full.length;
      this.label.setText(this.full);
      this.arrow.setVisible(true);
    } else {
      this.close();
    }
    return true;
  }

  close() {
    this.timer?.remove();
    this.box.setVisible(false);
    this.open = false;
  }
}
