import * as Phaser from "phaser";
import { Direction, type GridEngine } from "grid-engine";
import type { Subscription } from "rxjs";
import type { DayManifest } from "@/lib/day";
import { BASE_MAPS, FRAMES, MAP_H, MAP_W, TILE, VIEW_W, groundBlocked, hash, placeLandmark, tileAt } from "../maps";
import { FONT, TextBox } from "../ui/TextBox";
import { foodKey, landmarkKey } from "./BootScene";

type Interactable = { text: string; icon?: string };

/** One walkable highlight, parameterised by `manifest.scenes[index]`. */
export class HighlightScene extends Phaser.Scene {
  declare gridEngine: GridEngine;
  private index = 0;
  private textBox!: TextBox;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private carrier!: Phaser.GameObjects.Sprite;
  private visual!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private offset = { x: 0, y: 0 };
  private interactables = new Map<string, Interactable>();
  private leaving = false;
  private subs: Subscription[] = [];

  constructor() {
    super("Highlight");
  }

  init(data: { index: number }) {
    this.index = data.index;
    this.leaving = false;
    this.interactables.clear();
    this.subs = [];
  }

  create() {
    const manifest = this.registry.get("manifest") as DayManifest;
    const scene = manifest.scenes[this.index];
    const base = BASE_MAPS[scene.base];
    this.cameras.main.setBackgroundColor(base.sky);

    const blocked = new Set<string>();
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_W; x++) {
        const c = tileAt(scene.base, x, y);
        row.push(c === "_" ? -1 : c === "w" ? FRAMES.water : c === "p" ? (scene.base === "street" ? FRAMES.cobble : FRAMES.path) : hash(x, y) % 9 === 0 ? FRAMES.flowers : FRAMES.grass);
        if (groundBlocked(scene.base, x, y)) blocked.add(`${x},${y}`);
      }
      data.push(row);
    }

    if (scene.skyline) this.add.image(0, 0, `s${this.index}_skyline`).setOrigin(0).setDepth(-10);

    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (tileAt(scene.base, x, y) === "t") {
        this.add.image(x * TILE, y * TILE, "tiles", FRAMES.grass).setOrigin(0).setDepth(-5);
        this.add.image(x * TILE + 8, (y + 1) * TILE, "tree").setOrigin(0.5, 1).setDepth((y + 1) * TILE);
      }
    }

    // Landmarks block their lower two rows so the player can walk behind the upper part (depth sort).
    for (const landmark of scene.landmarks) {
      const p = placeLandmark(scene.base, landmark);
      const cx = (p.x0 + p.w / 2) * TILE;
      const bottom = (p.y0 + p.h) * TILE;
      this.add.image(cx, bottom - 2, "shadow").setDepth(bottom - 3).setDisplaySize(p.w * TILE - 6, 8);
      this.add.image(cx, bottom, landmarkKey(this.index, landmark.slot)).setOrigin(0.5, 1).setDepth(bottom);
      for (let y = p.y0 + p.h - 2; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) {
        blocked.add(`${x},${y}`);
        this.interactables.set(`${x},${y}`, { text: landmark.text });
      }
    }

    if (scene.food) {
      const { x, y } = scene.food.tile;
      this.add.rectangle(x * TILE + 8, y * TILE + 12, 14, 6, 0x6b4a2f).setStrokeStyle(1, 0x2b1d12).setDepth(y * TILE + 4);
      this.add.image(x * TILE + 8, y * TILE + 11, foodKey(this.index)).setOrigin(0.5, 1).setDepth(y * TILE + 5);
      blocked.add(`${x},${y}`);
      this.interactables.set(`${x},${y}`, { text: scene.food.text, icon: foodKey(this.index) });
    }

    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0)!.setDepth(-8);
    layer.forEachTile((tile) => {
      tile.properties = blocked.has(`${tile.x},${tile.y}`) ? { ge_collide: true } : {};
    });

    this.carrier = this.add.sprite(0, 0, "tiles", FRAMES.grass).setVisible(false);
    this.gridEngine.create(map, {
      characters: [{ id: "player", sprite: this.carrier, startPosition: scene.spawn, speed: 4, facingDirection: Direction.UP }],
    });
    this.offset = { x: this.carrier.x - scene.spawn.x * TILE, y: this.carrier.y - scene.spawn.y * TILE };
    this.shadow = this.add.image(0, 0, "shadow");
    this.visual = this.add.image(0, 0, "player").setOrigin(0.5, 1);

    // Exit marker on the edge path tile.
    const exit = scene.exit;
    const arrow = this.add.text(exit.x * TILE + 8, exit.y * TILE + 8, "▶", { fontFamily: FONT, fontSize: "8px", color: "#fff6b0" }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: arrow, x: arrow.x - 3, yoyo: true, repeat: -1, duration: 400 });

    this.textBox = new TextBox(this);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;
    const confirm = () => this.interact();
    this.input.keyboard!.on("keydown-SPACE", confirm);
    this.input.keyboard!.on("keydown-ENTER", confirm);

    this.subs.push(this.gridEngine.positionChangeFinished().subscribe(({ charId, enterTile }) => {
      if (charId === "player" && enterTile.x === exit.x && enterTile.y === exit.y) this.leave();
    }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.subs.forEach((s) => s.unsubscribe());
      this.input.keyboard?.off("keydown-SPACE", confirm);
      this.input.keyboard?.off("keydown-ENTER", confirm);
    });

    this.showCard(`${scene.time} · ${scene.title.toUpperCase()}`);
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  private showCard(label: string) {
    const text = this.add.text(VIEW_W / 2, 14, label, { fontFamily: FONT, fontSize: "8px", color: "#f6f1df", padding: { x: 8, y: 6 }, backgroundColor: "#1f1a2e" }).setOrigin(0.5, 0).setDepth(10_000);
    this.tweens.add({ targets: text, alpha: 0, delay: 1500, duration: 400, onComplete: () => text.destroy() });
  }

  private interact() {
    if (this.leaving) return;
    if (this.textBox.confirm()) return;
    const facing = this.gridEngine.getFacingPosition("player");
    const target = this.interactables.get(`${facing.x},${facing.y}`);
    if (target) this.textBox.show(target.text, target.icon);
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.textBox.close();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const manifest = this.registry.get("manifest") as DayManifest;
      if (this.index < manifest.scenes.length - 1) this.scene.start("Transit", { index: this.index });
      else this.scene.start("End");
    });
  }

  update(time: number) {
    if (!this.leaving && !this.textBox.open) {
      const dir = this.cursors.left.isDown || this.wasd.A.isDown ? Direction.LEFT : this.cursors.right.isDown || this.wasd.D.isDown ? Direction.RIGHT
        : this.cursors.up.isDown || this.wasd.W.isDown ? Direction.UP : this.cursors.down.isDown || this.wasd.S.isDown ? Direction.DOWN : undefined;
      if (dir) this.gridEngine.move("player", dir);
    }
    const moving = this.gridEngine.isMoving("player");
    const bob = moving ? -Math.round(Math.abs(Math.sin(time / 80)) * 2) : 0;
    const feetX = this.carrier.x - this.offset.x + TILE / 2;
    const feetY = this.carrier.y - this.offset.y + TILE - 1;
    this.visual.setPosition(feetX, feetY + bob).setDepth(feetY);
    this.shadow.setPosition(feetX, feetY - 1).setDepth(feetY - 1);
  }
}
