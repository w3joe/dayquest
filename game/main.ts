import { resolveDayAsset, type DayManifest, type DayScene, type InteractEffect, type TransitLeg, type WorldObject } from "@/lib/day";
import { worldCollision } from "./world-layout";
import { BASE_MAPS, FRAMES, MAP_H, MAP_W, TILE, VIEW_H, VIEW_W, groundBlocked, hash, placeLandmark } from "./maps";

// Shadwell's canvas, y-sorted sprites and footprint collisions, driven by day.json.
export type GameHandle = { destroy: () => void };
type Direction = "up" | "down" | "left" | "right";
type Talk = { text: string; icon?: string };
type Sprite = { image: HTMLImageElement; x: number; feet: number; width?: number; height?: number; shadow?: number; player?: boolean; home?: number; roam?: number; phase?: number };
type Effect = { kind: InteractEffect; x: number; y: number; at: number };
const DIR: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY: Record<string, Direction> = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
const PAPER = "#f6f1df", INK = "#1f1a2e";

export async function createGame(parent: HTMLElement, manifest: DayManifest, manifestUrl: string, onShare?: () => Promise<void> | undefined): Promise<GameHandle> {
  const images = new Map<string, HTMLImageElement>();
  const urls = new Set(["/tiles/dq-atlas.png", "/tiles/dq/tree.png", "/transit/bus.png", "/transit/tube.png", "/transit/city.png", "/transit/nelson.png", resolveDayAsset(manifest.player.sprite, manifestUrl)]);
  if (manifest.player.walkSheet) urls.add(resolveDayAsset(manifest.player.walkSheet, manifestUrl));
  for (const scene of manifest.scenes) {
    if (scene.world) {
      for (const material of ["grass", "flowers", "pavement", "cobble", "road", "kerb"]) urls.add(`/tiles/dq/library/${material}.png`);
      for (const object of scene.world.objects) urls.add(resolveDayAsset(object.sprite, manifestUrl));
    }
    for (const landmark of scene.landmarks) urls.add(resolveDayAsset(landmark.sprite, manifestUrl));
    if (scene.skyline) urls.add(resolveDayAsset(scene.skyline, manifestUrl));
    if (scene.food) {
      urls.add(resolveDayAsset(scene.food.sprite, manifestUrl));
      if (scene.food.icon) urls.add(resolveDayAsset(scene.food.icon, manifestUrl));
    }
  }
  await Promise.all([...urls].map(url => new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("World artwork timed out")), 20_000);
    image.onload = () => { clearTimeout(timer); images.set(url, image); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("World artwork could not load")); };
    image.src = url;
  })));
  if (!parent.isConnected) throw new Error("Game mount was removed");
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W; canvas.height = VIEW_H; canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Playable day. Arrow keys or WASD to walk. Space or Enter to read, skip transport, or share at the end.");
  canvas.style.cssText = "image-rendering:pixelated;max-width:100%;outline-offset:4px";
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const ctx = context;
  parent.append(canvas);
  const picture = (url: string) => images.get(url)!;
  const asset = (url: string) => picture(resolveDayAsset(url, manifestUrl));
  const playerImage = asset(manifest.player.sprite);
  const walkSheet = manifest.player.walkSheet ? asset(manifest.player.walkSheet) : undefined;
  if (walkSheet && (walkSheet.width !== 96 || walkSheet.height !== 192)) throw new Error("Character walking artwork has an invalid frame layout");
  let viewWidth = VIEW_W, viewHeight = VIEW_H;
  let index = 0, mode: "highlight" | "transit" | "end" = "highlight";
  let x = 0, y = 0, facing: Direction = "up", moving = false, elapsed = 0, chapterAt = 0;
  let dialogue: (Talk & { shown: number; remaining: string[] }) | undefined;
  let blocked = new Set<string>(), talks = new Map<string, Talk>(), sprites: Sprite[] = [];
  let effects: Effect[] = [];
  const lampsOn = new Set<string>(), spoken = new Map<string, number>();
  let transit: { leg: TransitLeg; change?: string; duration: number }[] = [], transitIndex = 0, transitAt = 0;
  let shareNote = "", destroyed = false;
  const keys = new Set<Direction>();

  function enterChapter() {
    const scene = manifest.scenes[index];
    blocked = new Set(); talks = new Map(); sprites = []; dialogue = undefined; effects = []; lampsOn.clear(); spoken.clear();
    viewWidth = scene.world ? 480 : VIEW_W; viewHeight = scene.world ? 320 : VIEW_H;
    canvas.width = viewWidth; canvas.height = viewHeight;
    resize();
    x = scene.spawn.x * TILE + 8; y = scene.spawn.y * TILE + 15; facing = scene.world ? "down" : "up";
    mode = "highlight"; chapterAt = elapsed;
    if (scene.world) {
      for (const object of scene.world.objects) {
        sprites.push({ image: asset(object.sprite), x: object.x, feet: object.y, width: object.width, height: object.height, shadow: Math.min(80, object.width * .65),
          home: object.x, roam: object.role === "npc" ? object.roam ?? 0 : 0, phase: object.id.length * 1.7 });
      }
    } else {
    for (let row = 0; row < MAP_H; row++) for (let col = 0; col < MAP_W; col++) {
      if (groundBlocked(scene.base, col, row)) blocked.add(`${col},${row}`);
      if (BASE_MAPS[scene.base].rows[row][col] === "t") sprites.push({ image: picture("/tiles/dq/tree.png"), x: col * TILE + 8, feet: (row + 1) * TILE });
    }
    for (const landmark of scene.landmarks) {
      const p = placeLandmark(scene.base, landmark), feet = (p.y0 + p.h) * TILE;
      sprites.push({ image: asset(landmark.sprite), x: (p.x0 + p.w / 2) * TILE, feet, shadow: p.w * TILE - 6 });
      for (let row = p.y0 + p.h - 2; row < p.y0 + p.h; row++) for (let col = p.x0; col < p.x0 + p.w; col++) {
        blocked.add(`${col},${row}`); talks.set(`${col},${row}`, { text: landmark.text });
      }
    }
    }
    if (scene.food) {
      const tile = scene.food.tile;
      blocked.add(`${tile.x},${tile.y}`);
      talks.set(`${tile.x},${tile.y}`, { text: scene.food.text, icon: scene.food.icon ?? scene.food.sprite });
      sprites.push({ image: asset(scene.food.sprite), x: tile.x * TILE + 8, feet: tile.y * TILE + 11, width: scene.world ? 32 : undefined, height: scene.world ? 32 : undefined });
    }
  }
  function leaveChapter() {
    dialogue = undefined; keys.clear(); moving = false;
    if (index === manifest.scenes.length - 1) { mode = "end"; return; }
    mode = "transit"; transit = []; transitIndex = 0; transitAt = elapsed;
    const legs = manifest.transit[index]?.legs ?? [];
    if (!legs.length) { nextChapter(); return; }
    legs.forEach((leg, i) => {
      const previous = legs[i - 1];
      if (leg.mode === "tube" && previous?.mode === "tube" && leg.line !== previous.line) transit.push({ leg, change: previous.stations.at(-1), duration: 1000 });
      transit.push({ leg, duration: 4000 });
    });
  }
  function nextChapter() { index++; keys.clear(); enterChapter(); }
  function confirm() {
    if (mode === "transit") { nextChapter(); return; }
    if (mode === "end") { void share(); return; }
    if (dialogue) {
      if (dialogue.shown < dialogue.text.length) dialogue.shown = dialogue.text.length;
      else if (dialogue.remaining.length) { dialogue.text = dialogue.remaining.shift()!; dialogue.shown = 0; }
      else dialogue = undefined;
      return;
    }
    const [dx, dy] = DIR[facing], col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    const target = talks.get(`${col + dx},${row + dy}`);
    if (target) { startTalk(target); return; }
    const world = manifest.scenes[index].world;
    if (world) {
      const food = manifest.scenes[index].food;
      if (food && Math.hypot(food.tile.x * TILE + 8 - x, food.tile.y * TILE + 11 - y) < 32) {
        startTalk({ text: food.text, icon: food.icon ?? food.sprite }); return;
      }
      const nearest = world.objects.filter(object => object.text && Math.hypot(object.x - x, object.y - y) < Math.max(34, object.width / 2 + 10) && (object.x - x) * dx + (object.y - y) * dy > -6)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (nearest) useObject(nearest);
    }
  }
  /** NPCs speak their lines in rotation; interactables run one of a small closed list of effects the renderer draws itself. */
  function useObject(object: WorldObject) {
    if (object.role === "npc") {
      const lines = [object.text!, ...(object.lines ?? [])], turn = spoken.get(object.id) ?? 0;
      spoken.set(object.id, turn + 1);
      effects.push({ kind: "wave", x: object.x, y: object.y - object.height, at: elapsed });
      startTalk({ text: `${object.name}: ${lines[turn % lines.length]}` });
      return;
    }
    if (object.role === "interactable" && object.effect) {
      if (object.effect === "toggle_lamp") { if (lampsOn.has(object.id)) lampsOn.delete(object.id); else lampsOn.add(object.id); }
      else effects.push({ kind: object.effect, x: object.x, y: object.y - object.height * .55, at: elapsed });
    }
    if (object.text) startTalk({ text: object.text });
  }
  function startTalk(talk: Talk) {
    const isWorld = Boolean(manifest.scenes[index].world);
    const left = talk.icon ? (isWorld ? 58 : 56) : 18;
    const width = viewWidth - left - (isWorld ? 24 : 22), maxLines = isWorld ? 4 : 3;
    ctx.font = 'bold 8px "Courier New",monospace';
    const lines: string[] = [];
    let line = "";
    for (const word of talk.text.split(/\s+/)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { lines.push(line); line = word; }
      else line += `${line ? " " : ""}${word}`;
    }
    if (line) lines.push(line);
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += maxLines) pages.push(lines.slice(i, i + maxLines).join(" "));
    dialogue = { ...talk, text: pages.shift() ?? talk.text, shown: 0, remaining: pages };
  }
  async function share() {
    if (onShare) { try { await onShare(); shareNote = "Share link above the game"; } catch { shareNote = "Use Share above the game"; } }
    else {
      try { await navigator.clipboard.writeText(location.href); shareNote = "Link copied"; }
      catch { shareNote = "Use Share above the game"; }
    }
  }
  const keydown = (event: KeyboardEvent) => {
    if (KEY[event.code]) { event.preventDefault(); keys.add(KEY[event.code]); }
    if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); if (!event.repeat) confirm(); }
  };
  const keyup = (event: KeyboardEvent) => { if (KEY[event.code]) keys.delete(KEY[event.code]); };
  const clearKeys = () => keys.clear();
  const click = () => { canvas.focus({ preventScroll: true }); if (mode === "end") void share(); };
  canvas.addEventListener("keydown", keydown); canvas.addEventListener("keyup", keyup);
  canvas.addEventListener("blur", clearKeys); canvas.addEventListener("pointerdown", click);
  window.addEventListener("blur", clearKeys);
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:10px;line-height:1.5;color:#f6f1df;font:12px monospace;width:100%";
  const disposers: (() => void)[] = [];
  for (const [label, direction] of [["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"], ["Read / Skip / Share", "confirm"]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.setAttribute("aria-label", direction === "confirm" ? "Read, skip transport or share" : `Walk ${direction}`);
    button.style.cssText = "min-width:40px;min-height:40px;border:2px solid #f6f1df;background:#342e46;color:#f6f1df;padding:6px 10px;touch-action:none";
    if (direction === "confirm") button.addEventListener("click", confirm);
    else {
      const down = (event: PointerEvent) => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(direction); };
      const up = () => keys.delete(direction);
      button.addEventListener("pointerdown", down); button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up); button.addEventListener("lostpointercapture", up);
      disposers.push(() => { button.removeEventListener("pointerdown", down); button.removeEventListener("pointerup", up); button.removeEventListener("pointercancel", up); button.removeEventListener("lostpointercapture", up); });
    }
    disposers.push(() => button.removeEventListener("click", confirm)); controls.append(button);
  }
  parent.append(controls);
  const resize = () => {
    const zoom = parent.clientWidth < viewWidth ? parent.clientWidth / viewWidth : Math.max(1, Math.floor(parent.clientWidth / viewWidth));
    canvas.style.width = `${Math.floor(viewWidth * zoom)}px`; canvas.style.height = `${Math.floor(viewHeight * zoom)}px`;
  };
  const observer = new ResizeObserver(resize); observer.observe(parent); resize();
  function text(value: string, px: number, py: number, size = 8, color = PAPER, align: CanvasTextAlign = "left") {
    ctx.font = `bold ${size}px "Courier New",monospace`; ctx.fillStyle = color; ctx.textAlign = align;
    ctx.textBaseline = "top"; ctx.fillText(value, Math.round(px), Math.round(py));
  }
  function wrap(value: string, left: number, top: number, width: number) {
    ctx.font = 'bold 8px "Courier New",monospace';
    let line = "", row = 0;
    for (const word of value.split(" ")) {
      if (ctx.measureText(`${line} ${word}`).width > width && line) { text(line, left, top + row++ * 11); line = word; }
      else line += `${line ? " " : ""}${word}`;
    }
    text(line, left, top + row * 11);
  }
  function shadow(px: number, py: number, width: number) {
    ctx.fillStyle = "rgba(20,16,40,.24)"; ctx.beginPath(); ctx.ellipse(px + 1, py - 1, width / 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawHighlight() {
    const scene = manifest.scenes[index];
    if (scene.world) { drawWorld(); return; }
    const base = BASE_MAPS[scene.base], atlas = picture("/tiles/dq-atlas.png");
    ctx.fillStyle = "#9fd0e8"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (scene.skyline) ctx.drawImage(asset(scene.skyline), 0, 0);
    for (let row = 0; row < MAP_H; row++) for (let col = 0; col < MAP_W; col++) {
      const tile = base.rows[row][col]; if (tile === "_") continue;
      const f = tile === "w" ? FRAMES.water : tile === "p" ? (scene.base === "street" ? FRAMES.cobble : FRAMES.path) : hash(col, row) % 9 === 0 ? FRAMES.flowers : FRAMES.grass;
      ctx.drawImage(atlas, f * TILE, 0, TILE, TILE, col * TILE, row * TILE, TILE, TILE);
    }
    if (scene.food) { ctx.fillStyle = "#6b4a2f"; ctx.fillRect(scene.food.tile.x * TILE + 1, scene.food.tile.y * TILE + 6, 14, 7); }
    for (const sprite of sprites) if (sprite.shadow) shadow(sprite.x, sprite.feet, sprite.shadow);
    shadow(x, y, 15);
    for (const sprite of [...sprites, { image: playerImage, x, feet: y, player: true }].sort((a, b) => a.feet - b.feet)) {
      if (sprite.player && walkSheet) { drawPlayer(sprite.x, sprite.feet); continue; }
      const bob = sprite.player && moving ? -Math.round(Math.abs(Math.sin(elapsed / 80)) * 2) : 0;
      ctx.drawImage(sprite.image, Math.round(sprite.x - sprite.image.width / 2), Math.round(sprite.feet - sprite.image.height + bob));
    }
    text("▶", scene.exit.x * TILE + 4, scene.exit.y * TILE + 4, 10, "#fff6b0");
    if (elapsed - chapterAt < 1900) {
      ctx.fillStyle = INK; ctx.fillRect(6, 6, VIEW_W - 12, 24);
      text(`${scene.time} · ${scene.title}`, VIEW_W / 2, 14, 8, PAPER, "center");
    }
    if (dialogue) {
      ctx.fillStyle = INK; ctx.fillRect(8, VIEW_H - 64, VIEW_W - 16, 56);
      ctx.strokeStyle = PAPER; ctx.lineWidth = 2; ctx.strokeRect(9, VIEW_H - 63, VIEW_W - 18, 54);
      const left = dialogue.icon ? 56 : 18;
      if (dialogue.icon) ctx.drawImage(asset(dialogue.icon), 18, VIEW_H - 52, 32, 32);
      wrap(dialogue.text.slice(0, Math.floor(dialogue.shown)), left, VIEW_H - 53, VIEW_W - left - 22);
      if (dialogue.shown >= dialogue.text.length) text("▼", VIEW_W - 26, VIEW_H - 23);
    }
  }
  function drawPlayer(px: number, py: number) {
    if (walkSheet) {
      const row = { down: 0, left: 1, right: 2, up: 3 }[facing];
      const frame = moving ? 1 + Math.floor(elapsed / 135) % 2 : 0;
      ctx.drawImage(walkSheet, frame * 32, row * 48, 32, 48, Math.round(px - 16), Math.round(py - 48), 32, 48);
    } else ctx.drawImage(playerImage, Math.round(px - 16), Math.round(py - 48), 32, 48);
  }
  /** Small pixel flourishes. Lamps stay lit until used again; everything else lasts about a second and a half. */
  function drawEffects(world: NonNullable<DayScene["world"]>) {
    for (const object of world.objects) {
      if (!lampsOn.has(object.id)) continue;
      const glow = .30 + Math.sin(elapsed / 300) * .04, cx = object.x, cy = object.y - object.height + 8;
      ctx.fillStyle = `rgba(255,214,120,${glow})`; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,238,170,.55)"; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
    }
    effects = effects.filter(effect => elapsed - effect.at < 1500);
    for (const effect of effects) {
      const t = (elapsed - effect.at) / 1500, fade = 1 - t;
      if (effect.kind === "ring" || effect.kind === "press_button") {
        ctx.strokeStyle = effect.kind === "ring" ? `rgba(246,241,223,${fade})` : `rgba(255,236,120,${fade})`; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(effect.x, effect.y, 6 + t * 30 + i * 8, 0, Math.PI * 2); ctx.stroke(); }
      } else if (effect.kind === "shake_leaves") {
        for (let i = 0; i < 16; i++) {
          const fall = Math.min(1, t * 1.5 + (i % 5) * .05), px = effect.x + Math.sin(i * 2.3 + t * 6) * (12 + i), py = effect.y - 34 + fall * 52;
          ctx.fillStyle = ["#d9822b", "#b5452f", "#e0b33a", "#8f9a3a"][i % 4]; ctx.globalAlpha = fade; ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
        }
        ctx.globalAlpha = 1;
      } else {
        // sit, pet, feed, wave: hearts drifting up.
        for (let i = 0; i < 3; i++) text("♥", effect.x - 10 + i * 10, effect.y - 6 - t * 28 - i * 5, 8, `rgba(224,92,120,${fade})`, "center");
      }
    }
  }
  function drawWorld() {
    const scene = manifest.scenes[index], world = scene.world!;
    const cameraX = Math.round(Math.max(0, Math.min(world.width * TILE - viewWidth, x - viewWidth / 2)));
    const cameraY = Math.round(Math.max(0, Math.min(world.height * TILE - viewHeight, y - viewHeight * .62)));
    const materials: Record<string, string> = { g: "grass", f: "flowers", p: "pavement", c: "cobble", r: "road", k: "kerb" };
    ctx.fillStyle = "#85a77b"; ctx.fillRect(0, 0, viewWidth, viewHeight);
    ctx.save(); ctx.translate(-cameraX, -cameraY);
    for (let row = 0; row < world.height; row++) for (let col = 0; col < world.width; col++) {
      if (world.ground[row][col] === "w") { ctx.fillStyle = "#568fa4"; ctx.fillRect(col * TILE, row * TILE, TILE, TILE); continue; }
      ctx.drawImage(picture(`/tiles/dq/library/${materials[world.ground[row][col]] ?? "pavement"}.png`), col * TILE, row * TILE, TILE, TILE);
    }
    // Painted road markings and a pedestrian crossing keep the street legible.
    ctx.fillStyle = "#eee5bc";
    for (let col = 0; col < world.width; col += 4) if (col < 17 || col > 22) ctx.fillRect(col * TILE, 16 * TILE - 2, 24, 2);
    ctx.fillStyle = "#ece7d2";
    for (let row = 14; row < 18; row++) ctx.fillRect(18 * TILE, row * TILE + 3, 64, 7);
    if (scene.food) {
      const tile = scene.food.tile;
      ctx.fillStyle = "#48372b"; ctx.fillRect(tile.x * TILE + 1, tile.y * TILE + 10, 14, 9);
      ctx.fillStyle = "#9b7350"; ctx.fillRect(tile.x * TILE - 3, tile.y * TILE + 5, 22, 7);
    }
    for (const sprite of sprites) if (sprite.shadow) shadow(sprite.x, sprite.feet, sprite.shadow);
    shadow(x, y, 15);
    for (const sprite of sprites) if (sprite.roam) sprite.x = Math.round((sprite.home ?? sprite.x) + Math.sin(elapsed / 1400 + (sprite.phase ?? 0)) * sprite.roam);
    const entities: Sprite[] = [...sprites, { image: playerImage, x, feet: y, player: true }];
    for (const sprite of entities.sort((a, b) => a.feet - b.feet)) {
      if (sprite.player) { drawPlayer(sprite.x, sprite.feet); continue; }
      const width = sprite.width ?? sprite.image.width, height = sprite.height ?? sprite.image.height;
      ctx.drawImage(sprite.image, Math.round(sprite.x - width / 2), Math.round(sprite.feet - height), width, height);
    }
    drawEffects(world);
    const exitX = scene.exit.x * TILE + 8, exitY = scene.exit.y * TILE + 8;
    ctx.fillStyle = "#274c3b"; ctx.fillRect(exitX - 31, exitY - 27, 36, 18);
    text("FINISH →", exitX - 13, exitY - 22, 6, PAPER, "center");
    text("▶", exitX - 4, exitY - 3, 11, "#fff6b0");
    ctx.restore();
    ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, 8, viewWidth - 16, 25);
    text(`${scene.time} · ${scene.title}`, 16, 16, 8);
    if (elapsed - chapterAt < 6000 && !dialogue) {
      ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, viewHeight - 28, viewWidth - 16, 20);
      text("WALK · SPACE TO READ · FOLLOW THE FINISH SIGN →", viewWidth / 2, viewHeight - 22, 7, PAPER, "center");
    }
    if (dialogue) {
      ctx.fillStyle = INK; ctx.fillRect(8, viewHeight - 81, viewWidth - 16, 73);
      ctx.strokeStyle = PAPER; ctx.lineWidth = 2; ctx.strokeRect(9, viewHeight - 80, viewWidth - 18, 71);
      const left = dialogue.icon ? 58 : 18;
      if (dialogue.icon) ctx.drawImage(asset(dialogue.icon), 18, viewHeight - 65, 32, 32);
      wrap(dialogue.text.slice(0, Math.floor(dialogue.shown)), left, viewHeight - 70, viewWidth - left - 24);
      if (dialogue.shown >= dialogue.text.length) text(dialogue.remaining.length ? "SPACE FOR MORE ▼" : "SPACE TO CLOSE ▼", viewWidth - 18, viewHeight - 22, 6, PAPER, "right");
    }
  }
  function drawTransit() {
    const step = transit[transitIndex], leg = step.leg, progress = Math.min(1, (elapsed - transitAt) / step.duration);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (step.change) {
      ctx.fillStyle = leg.mode === "tube" ? leg.color : "#b36305"; ctx.fillRect(0, 80, VIEW_W, 64);
      text(`CHANGE AT ${step.change.toUpperCase()}`, VIEW_W / 2, 96, 8, PAPER, "center");
      text(leg.mode === "tube" ? `${leg.line.toUpperCase()} LINE` : "", VIEW_W / 2, 115, 8, PAPER, "center"); return;
    }
    if (leg.mode === "bus") {
      ctx.fillStyle = "#9fd0e8"; ctx.fillRect(0, 0, VIEW_W, 150);
      const city = picture("/transit/city.png");
      for (let px = -(progress * 130 % city.width); px < VIEW_W; px += city.width) ctx.drawImage(city, px, 150 - city.height);
      ctx.fillStyle = "#4a4a55"; ctx.fillRect(0, 150, VIEW_W, 50);
      const bus = picture("/transit/bus.png"), bx = -bus.width + progress * (VIEW_W + bus.width * 2);
      if (leg.route === "24") ctx.drawImage(picture("/transit/nelson.png"), VIEW_W - progress * 420, 65);
      ctx.drawImage(bus, Math.round(bx), 180 - bus.height);
      text(`${leg.route} ${leg.destination.toUpperCase()}`, VIEW_W / 2, 20, 8, "#ffb03b", "center");
      text(`${leg.from} → ${leg.to}`, VIEW_W / 2, 210, 8, PAPER, "center");
    } else {
      const train = picture("/transit/tube.png"); ctx.fillStyle = "#2e2a3c";
      for (let px = -(progress * 600 % 64); px < VIEW_W; px += 64) ctx.fillRect(px, 56, 8, 112);
      ctx.fillStyle = leg.color; ctx.fillRect(0, 40, VIEW_W, 10);
      ctx.drawImage(train, Math.round(-train.width + progress * (VIEW_W + train.width * 2)), 168 - train.height);
      text(`${leg.line.toUpperCase()} LINE`, VIEW_W / 2, 18, 10, PAPER, "center");
      const station = leg.stations[Math.min(leg.stations.length - 1, Math.floor(progress * leg.stations.length))];
      text(station.toUpperCase(), VIEW_W / 2, 190, 8, "#ffb03b", "center");
      text(`${leg.stations[0]} → ${leg.stations.at(-1)}`, VIEW_W / 2, 210, 8, PAPER, "center");
    }
    text("SPACE / A: SKIP", VIEW_W - 8, VIEW_H - 12, 6, PAPER, "right");
  }
  function drawEnd() {
    const cx = viewWidth / 2;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, viewWidth, viewHeight);
    text("A DAY WORTH VISITING", cx, 24, 15, PAPER, "center");
    text(`${manifest.player.name === "You" ? "Your day" : `${manifest.player.name}'s day`} · ${manifest.date}`, cx, 52, 8, PAPER, "center");
    manifest.scenes.forEach((scene, i) => text(`${scene.time} · ${scene.title}`, cx, 77 + i * 16, 8, PAPER, "center"));
    ctx.drawImage(playerImage, cx - 16, viewHeight - 103, 32, 48);
    ctx.fillStyle = "#3f7d4c"; ctx.fillRect(cx - 70, viewHeight - 48, 140, 26);
    text("SHARE THIS DAY ↗", cx, viewHeight - 39, 8, PAPER, "center");
    text(shareNote || "SPACE / ENTER OR TAP TO SHARE", cx, viewHeight - 14, 7, PAPER, "center");
  }
  function collision(px: number, py: number) {
    const scene = manifest.scenes[index];
    if (scene.world) {
      if (worldCollision(scene.world, px, py)) return true;
      if (!scene.food) return false;
      const tile = scene.food.tile;
      return px + 4 > tile.x * TILE && px - 4 < (tile.x + 1) * TILE && py > tile.y * TILE + 6 && py - 5 < (tile.y + 1) * TILE;
    }
    if (px < 5 || px > VIEW_W - 5 || py < 5 || py > VIEW_H - 1) return true;
    return [[px - 4, py - 4], [px + 4, py - 4], [px - 4, py], [px + 4, py]].some(([a, b]) => blocked.has(`${Math.floor(a / TILE)},${Math.floor(b / TILE)}`));
  }
  let previous = performance.now(), frameId = 0;
  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min(40, now - previous); previous = now; elapsed += dt; moving = false;
    if (mode === "highlight") {
      if (dialogue) dialogue.shown = Math.min(dialogue.text.length, dialogue.shown + dt * .04);
      else {
        const direction = [...keys].at(-1);
        if (direction) {
          facing = direction; const [dx, dy] = DIR[direction], speed = dt * (manifest.scenes[index].world ? .092 : .064), nx = x + dx * speed, ny = y + dy * speed;
          if (!collision(nx, y)) { moving ||= nx !== x; x = nx; }
          if (!collision(x, ny)) { moving ||= ny !== y; y = ny; }
          const exit = manifest.scenes[index].exit;
          const atExit = manifest.scenes[index].world
            ? Math.abs(x - (exit.x * TILE + 8)) < 12 && Math.abs(y - (exit.y * TILE + 8)) < 22
            : Math.floor(x / TILE) === exit.x && Math.floor(y / TILE) === exit.y;
          if (atExit) leaveChapter();
        }
      }
    } else if (mode === "transit" && elapsed - transitAt >= transit[transitIndex].duration) {
      if (++transitIndex >= transit.length) nextChapter(); else transitAt = elapsed;
    }
    ctx.imageSmoothingEnabled = false;
    if (mode === "highlight") drawHighlight(); else if (mode === "transit") drawTransit(); else drawEnd();
    frameId = requestAnimationFrame(frame);
  }
  enterChapter(); frameId = requestAnimationFrame(frame);
  return { destroy() {
    destroyed = true; cancelAnimationFrame(frameId); observer.disconnect(); keys.clear();
    canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("keyup", keyup); canvas.removeEventListener("blur", clearKeys); canvas.removeEventListener("pointerdown", click);
    window.removeEventListener("blur", clearKeys); disposers.forEach(dispose => dispose()); canvas.remove(); controls.remove();
  } };
}
