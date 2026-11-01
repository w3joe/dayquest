import * as Phaser from "phaser";
import type { DayManifest, TransitLeg } from "@/lib/day";
import { VIEW_H, VIEW_W } from "../maps";
import { FONT } from "../ui/TextBox";

const LEG_MS = 4000;
const CHANGE_MS = 1000;
const hex = (color: string) => Phaser.Display.Color.HexStringToColor(color).color;

type Step = { ms: number; build: (root: Phaser.GameObjects.Container) => void };

/** Between highlight i and i+1: plays `manifest.transit[i].legs` in order. Space skips. Static art only, never generated live. */
export class TransitScene extends Phaser.Scene {
  private index = 0;
  private root!: Phaser.GameObjects.Container;
  private ticks: Array<(dt: number) => void> = [];
  private finished = false;
  private timer?: Phaser.Time.TimerEvent;

  constructor() {
    super("Transit");
  }

  init(data: { index: number }) {
    this.index = data.index;
    this.finished = false;
    this.ticks = [];
  }

  create() {
    const manifest = this.registry.get("manifest") as DayManifest;
    this.cameras.main.setBackgroundColor("#1f1a2e").fadeIn(300, 0, 0, 0);
    const legs = manifest.transit[this.index].legs;
    const steps: Step[] = [];
    legs.forEach((leg, i) => {
      const previous = legs[i - 1];
      if (leg.mode === "tube" && previous?.mode === "tube" && previous.line !== leg.line) {
        steps.push({ ms: CHANGE_MS, build: (root) => this.changeCard(root, previous.stations[previous.stations.length - 1], leg) });
      }
      steps.push({ ms: LEG_MS, build: (root) => (leg.mode === "bus" ? this.bus(root, leg) : this.tube(root, leg)) });
    });

    this.add.text(VIEW_W - 6, VIEW_H - 12, "SPACE: SKIP", { fontFamily: FONT, fontSize: "8px", color: "#a99fcf" }).setOrigin(1, 0).setDepth(1000);
    const skip = () => this.finish();
    this.input.keyboard!.on("keydown-SPACE", skip);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off("keydown-SPACE", skip));

    const run = (n: number) => {
      if (this.finished) return;
      if (n >= steps.length) return this.finish();
      this.root?.destroy();
      this.ticks = [];
      this.root = this.add.container(0, 0);
      steps[n].build(this.root);
      this.timer = this.time.delayedCall(steps[n].ms, () => run(n + 1));
    };
    run(0);
  }

  update(_: number, delta: number) {
    for (const tick of this.ticks) tick(delta);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.timer?.remove();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start("Highlight", { index: this.index + 1 }));
  }

  private caption(root: Phaser.GameObjects.Container, from: string, to: string) {
    const plate = this.add.rectangle(0, VIEW_H - 40, VIEW_W, 40, 0x1f1a2e).setOrigin(0).setDepth(900);
    const text = this.add.text(8, VIEW_H - 34, `${from.toUpperCase()}\n→ ${to.toUpperCase()}`, { fontFamily: FONT, fontSize: "8px", color: "#f6f1df", lineSpacing: 6 }).setDepth(901);
    root.add([plate, text]);
  }

  private bus(root: Phaser.GameObjects.Container, leg: Extract<TransitLeg, { mode: "bus" }>) {
    const sky = this.add.rectangle(0, 0, VIEW_W, 150, 0x9fd0e8).setOrigin(0);
    const skyline = this.add.tileSprite(0, 54, VIEW_W, 96, "transit_city").setOrigin(0);
    const road = this.add.rectangle(0, 150, VIEW_W, 50, 0x4a4a55).setOrigin(0);
    const kerb = this.add.rectangle(0, 148, VIEW_W, 4, 0xb8b0a0).setOrigin(0);
    const dashes = this.add.graphics();
    root.add([sky, skyline, road, kerb, dashes]);

    let scroll = 0;
    if (leg.route === "24") {
      const nelson = this.add.image(VIEW_W + 40, 148, "transit_nelson").setOrigin(0.5, 1);
      root.add(nelson);
      this.tweens.add({ targets: nelson, x: -60, delay: 700, duration: 2600 });
    }
    const bus = this.add.image(-60, 184, "transit_bus").setOrigin(0.5, 1).setScale(1.5);
    const plate = this.add.text(0, 0, `${leg.route} ${leg.destination.toUpperCase()}`, { fontFamily: FONT, fontSize: "8px", color: "#ffb03b", backgroundColor: "#111111", padding: { x: 4, y: 3 } }).setOrigin(0.5, 1);
    root.add([bus, plate]);
    this.tweens.add({ targets: bus, x: 150, duration: 800, ease: "Sine.easeOut" });
    this.tweens.add({ targets: bus, x: VIEW_W + 110, delay: LEG_MS - 700, duration: 700, ease: "Sine.easeIn" });

    let t = 0;
    this.ticks.push((dt) => {
      t += dt;
      scroll += dt * 0.06;
      skyline.tilePositionX = scroll * 0.4;
      dashes.clear().fillStyle(0xf6f1df, 1);
      for (let x = -((scroll * 1.5) % 40); x < VIEW_W; x += 40) dashes.fillRect(x, 176, 20, 3);
      bus.y = 184 - (Math.floor(t / 120) % 2);
      plate.setPosition(bus.x + 14, bus.y - bus.displayHeight - 2);
    });
    this.caption(root, leg.from, leg.to);
  }

  private tube(root: Phaser.GameObjects.Container, leg: Extract<TransitLeg, { mode: "tube" }>) {
    const color = hex(leg.color);
    const bg = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x14121c).setOrigin(0);
    const wall = this.add.graphics();
    const track = this.add.rectangle(0, 164, VIEW_W, 36, 0x25222f).setOrigin(0);
    root.add([bg, wall, track]);

    const train = this.add.image(-80, 170, "transit_tube").setOrigin(0.5, 1).setScale(1.6).setTint(color);
    root.add(train);
    this.tweens.add({ targets: train, x: VIEW_W / 2, duration: 900, ease: "Sine.easeOut" });

    // Roundel with the line name.
    const roundel = this.add.graphics();
    roundel.lineStyle(5, color, 1).strokeCircle(30, 30, 16).fillStyle(0x0019a8, 1).fillRect(8, 24, 44, 12);
    const line = this.add.text(30, 30, leg.line.toUpperCase(), { fontFamily: FONT, fontSize: "6px", color: "#ffffff" }).setOrigin(0.5);
    root.add([roundel, line]);

    // Station board: ticks through leg.stations[].
    const board = this.add.text(VIEW_W - 8, 14, "", { fontFamily: FONT, fontSize: "8px", color: "#ffb03b", backgroundColor: "#000000", padding: { x: 6, y: 5 }, lineSpacing: 6, align: "right" }).setOrigin(1, 0);
    root.add(board);
    const stations = leg.stations;
    const render = (current: number, arrived: boolean) => board.setText(stations.map((s, i) => `${i < current || (arrived && i === current) ? "●" : i === current ? "▶" : "○"} ${s.toUpperCase()}`).join("\n"));
    render(0, false);
    const stops = Math.max(1, stations.length - 1);
    stations.forEach((_, i) => {
      if (i === 0) return;
      this.time.delayedCall((LEG_MS - 800) * (i / stops) - 300, () => render(i, false));
      this.time.delayedCall((LEG_MS - 800) * (i / stops) + 700, () => render(i, true));
    });

    let scroll = 0;
    let speed = 0.5;
    this.tweens.add({ targets: { v: 0 }, v: 1, duration: LEG_MS, onUpdate: (tw) => { speed = tw.progress < 0.8 ? 0.5 : 0.5 * (1 - (tw.progress - 0.8) / 0.2); } });
    let t = 0;
    this.ticks.push((dt) => {
      t += dt;
      scroll += dt * speed;
      wall.clear();
      for (let x = -(scroll % 64); x < VIEW_W; x += 64) {
        wall.fillStyle(0x2e2a3c, 1).fillRect(x, 60, 8, 104);
        wall.fillStyle(0xfff3b8, 1).fillRect(x + 28, 56, 14, 3);
      }
      train.y = 170 - (speed > 0.1 ? Math.floor(t / 100) % 2 : 0);
    });
    this.caption(root, leg.stations[0], leg.stations[leg.stations.length - 1]);
  }

  private changeCard(root: Phaser.GameObjects.Container, station: string, next: Extract<TransitLeg, { mode: "tube" }>) {
    const bg = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x14121c).setOrigin(0);
    const stripe = this.add.rectangle(0, VIEW_H / 2 - 22, VIEW_W, 44, hex(next.color)).setOrigin(0);
    const text = this.add.text(VIEW_W / 2, VIEW_H / 2, `CHANGE AT ${station.toUpperCase()}\n${next.line.toUpperCase()} LINE`, { fontFamily: FONT, fontSize: "8px", color: "#ffffff", align: "center", lineSpacing: 8 }).setOrigin(0.5);
    root.add([bg, stripe, text]);
  }
}
