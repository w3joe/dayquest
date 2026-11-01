import { resolveDayAsset, type DayManifest, type TransitLeg, type TravelPoint, type JourneyLeg } from "@/lib/day";
import { activeJourney, advanceJourney, checkpointJourney, departureJourney, journeyPhaseDuration, journeyStorageKey, restoreJourney, type JourneyEvent, type JourneyState } from "./journey";
import { worldCollision } from "./world-layout";
import { BASE_MAPS, FRAMES, MAP_H, MAP_W, TILE, VIEW_H, VIEW_W, groundBlocked, hash, placeLandmark } from "./maps";

// Shadwell's canvas, y-sorted sprites and footprint collisions, driven by day.json.
export type GameHandle = { destroy: () => void };
type Direction = "up" | "down" | "left" | "right";
type Talk = { text: string; icon?: string };
type Sprite = { image: HTMLImageElement; x: number; feet: number; width?: number; height?: number; shadow?: number; player?: boolean };
const DIR: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY: Record<string, Direction> = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
const PAPER = "#f6f1df", INK = "#1f1a2e";

export async function createGame(parent: HTMLElement, manifest: DayManifest, manifestUrl: string, onShare?: () => Promise<void> | undefined): Promise<GameHandle> {
  const images = new Map<string, HTMLImageElement>();
  const urls = new Set(["/tiles/dq-atlas.png", "/tiles/dq/tree.png", "/transit/bus.png", "/transit/tube.png", "/transit/city.png", "/transit/nelson.png", resolveDayAsset(manifest.player.sprite, manifestUrl)]);
  if (manifest.journeys?.length) {
    urls.add("/transit/library/bus_stop.png"); urls.add("/transit/library/station.png");
  }
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
  let storedJourney: string | null = null;
  if (manifest.journeys?.length) { try { storedJourney = localStorage.getItem(journeyStorageKey(manifest.id)); } catch { /* Browsing still works without persistent storage. */ } }
  let journeyState: JourneyState | undefined = manifest.journeys?.length ? restoreJourney(manifest, storedJourney) : undefined;
  let index = journeyState ? Math.max(0, manifest.scenes.findIndex(scene => scene.id === journeyState?.sceneId)) : 0;
  let mode: "highlight" | "transit" | "journey" | "end" = "highlight";
  let boardingOrigin = { x: 0, y: 0 };
  let x = 0, y = 0, facing: Direction = "up", moving = false, elapsed = 0, chapterAt = 0;
  let dialogue: (Talk & { shown: number; remaining: string[] }) | undefined;
  let blocked = new Set<string>(), talks = new Map<string, Talk>(), sprites: Sprite[] = [];
  let transit: { leg: TransitLeg; change?: string; duration: number }[] = [], transitIndex = 0, transitAt = 0;
  let shareNote = "", destroyed = false;
  const keys = new Set<Direction>();

  function enterChapter() {
    const scene = manifest.scenes[index];
    blocked = new Set(); talks = new Map(); sprites = []; dialogue = undefined;
    viewWidth = scene.world ? 480 : VIEW_W; viewHeight = scene.world ? 320 : VIEW_H;
    canvas.width = viewWidth; canvas.height = viewHeight;
    resize();
    const incoming = journeyState?.phase === "exploring" ? manifest.journeys?.find(item => item.toSceneId === scene.id && journeyState?.completed.includes(item.id)) : undefined;
    const entry = incoming?.arrival.approach ?? scene.spawn;
    x = entry.x * TILE + 8; y = entry.y * TILE + 15; facing = scene.world ? "down" : "up";
    mode = "highlight"; chapterAt = elapsed;
    if (scene.world) {
      for (const object of scene.world.objects) {
        sprites.push({ image: asset(object.sprite), x: object.x, feet: object.y, width: object.width, height: object.height, shadow: Math.min(80, object.width * .65) });
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
    if (journeyState) {
      if (journeyState.phase === "prompt") { changeJourney({ type: "confirm" }); return; }
      if (["boarding", "riding", "transfer"].includes(journeyState.phase)) { changeJourney({ type: "skip" }); return; }
      if (journeyState.phase === "arriving") return;
    }
    if (mode === "transit") { nextChapter(); return; }
    if (mode === "end") { void share(); return; }
    if (dialogue) {
      if (dialogue.shown < dialogue.text.length) dialogue.shown = dialogue.text.length;
      else if (dialogue.remaining.length) { dialogue.text = dialogue.remaining.shift()!; dialogue.shown = 0; }
      else dialogue = undefined;
      return;
    }
    const departure = journeyState && departureJourney(manifest, journeyState);
    if (departure && nearTravelPoint(departure.departure)) {
      changeJourney({ type: "prompt", journeyId: departure.id, nearby: true }); return;
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
      if (nearest?.text) startTalk({ text: nearest.text });
    }
  }
  function nearTravelPoint(point: TravelPoint) {
    return Math.hypot(x - (point.approach.x * TILE + 8), y - (point.approach.y * TILE + 15)) < 34;
  }
  function saveJourney() {
    if (!journeyState) return;
    try { localStorage.setItem(journeyStorageKey(manifest.id), JSON.stringify(checkpointJourney(manifest, journeyState))); } catch { /* Optional browser persistence. */ }
  }
  function changeJourney(event: JourneyEvent) {
    if (!journeyState) return;
    const before = journeyState;
    journeyState = advanceJourney(manifest, before, event);
    if (journeyState === before) return;
    const journey = activeJourney(manifest, journeyState);
    if (journeyState.sceneId !== before.sceneId) {
      index = manifest.scenes.findIndex(scene => scene.id === journeyState!.sceneId);
      enterChapter();
      if (journey) { x = journey.arrival.tile.x * TILE + 8; y = journey.arrival.tile.y * TILE + 15; }
    }
    if (journeyState.phase !== before.phase) {
      if (!(before.phase === "prompt" && journeyState.phase === "exploring")) keys.clear();
      dialogue = undefined;
      if (journeyState.phase === "boarding") boardingOrigin = { x, y };
      mode = ["boarding", "riding", "transfer", "arriving"].includes(journeyState.phase) ? "journey" : "highlight";
      if (journeyState.phase === "exploring") {
        const arrived = activeJourney(manifest, before);
        if (before.phase === "arriving" && arrived) { x = arrived.arrival.approach.x * TILE + 8; y = arrived.arrival.approach.y * TILE + 15; }
        moving = false; chapterAt = elapsed;
      }
      saveJourney();
      const description = journey ? journeyState.phase === "prompt" ? `Ready to travel from ${journey.departure.label}. Press Read again to ${journey.legs[0].mode === "walk" ? "set off" : "board"}; walk away to cancel.`
        : journeyState.phase === "exploring" ? `Arrived at ${journey.arrival.label}. Walk to explore.`
        : `${journeyState.phase === "arriving" ? "Arriving at" : "Travelling to"} ${journey.arrival.label}.` : "Walk to explore.";
      journeyStatus.textContent = description;
    }
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
    if (event.code === "Escape" && journeyState?.phase === "prompt") { event.preventDefault(); changeJourney({ type: "cancel" }); }
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
  const journeyStatus = document.createElement("p");
  journeyStatus.setAttribute("aria-live", "polite");
  journeyStatus.style.cssText = "color:#f6f1df;font:11px monospace;line-height:1.5;text-align:center;margin:5px 8px";
  if (journeyState) { journeyStatus.textContent = departureJourney(manifest, journeyState) ? "Walk to the marked stop, then press Read to travel." : "Explore this final scene, then follow the Finish sign."; parent.append(journeyStatus); }
  const disposers: (() => void)[] = [];
  for (const [label, direction] of [["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"], [journeyState ? "Read / Travel / Skip / Share" : "Read / Skip / Share", "confirm"]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.setAttribute("aria-label", direction === "confirm" ? "Read, travel, skip transport or share" : `Walk ${direction}`);
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
  if (journeyState) {
    const restart = document.createElement("button"); restart.type = "button"; restart.textContent = "Restart journey";
    restart.style.cssText = "min-height:40px;border:1px solid #a6b79a;background:transparent;color:#f6f1df;padding:6px 10px;touch-action:manipulation";
    const reset = () => {
      journeyState = restoreJourney(manifest); index = 0; keys.clear(); shareNote = "";
      enterChapter(); saveJourney();
      journeyStatus.textContent = "Journey restarted. Walk to the marked stop, then press Read to travel.";
    };
    restart.addEventListener("click", reset); disposers.push(() => restart.removeEventListener("click", reset)); controls.append(restart);
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
    const departure = journeyState && departureJourney(manifest, journeyState);
    const active = journeyState && activeJourney(manifest, journeyState);
    const incoming = manifest.journeys?.find(item => item.toSceneId === scene.id);
    if (incoming) drawTravelPoint(incoming.arrival, false);
    if (departure) drawTravelPoint(departure.departure, true);
    const travel = journeyState?.phase === "boarding" ? active?.departure : journeyState?.phase === "arriving" ? active?.arrival : undefined;
    if (travel && active?.legs[journeyState?.phase === "arriving" ? active.legs.length - 1 : 0]?.mode === "bus") {
      const bus = picture("/transit/bus.png");
      ctx.drawImage(bus, travel.tile.x * TILE - 94, travel.tile.y * TILE - 4, 144, 72);
    }
    for (const sprite of sprites) if (sprite.shadow) shadow(sprite.x, sprite.feet, sprite.shadow);
    const hidePlayer = journeyState?.phase === "boarding" && journeyState.phaseMs > 1050;
    if (!hidePlayer) shadow(x, y, 15);
    const entities: Sprite[] = hidePlayer ? [...sprites] : [...sprites, { image: playerImage, x, feet: y, player: true }];
    for (const sprite of entities.sort((a, b) => a.feet - b.feet)) {
      if (sprite.player) { drawPlayer(sprite.x, sprite.feet); continue; }
      const width = sprite.width ?? sprite.image.width, height = sprite.height ?? sprite.image.height;
      ctx.drawImage(sprite.image, Math.round(sprite.x - width / 2), Math.round(sprite.feet - height), width, height);
    }
    if (incoming) drawTravelPoint(incoming.arrival, false, true);
    if (departure) drawTravelPoint(departure.departure, true, true);
    if (!journeyState || index === manifest.scenes.length - 1) {
      const exitX = scene.exit.x * TILE + 8, exitY = scene.exit.y * TILE + 8;
      ctx.fillStyle = "#274c3b"; ctx.fillRect(exitX - 31, exitY - 27, 36, 18);
      text("FINISH →", exitX - 13, exitY - 22, 6, PAPER, "center");
      text("▶", exitX - 4, exitY - 3, 11, "#fff6b0");
    }
    ctx.restore();
    ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, 8, viewWidth - 16, 25);
    text(`${scene.time} · ${scene.title}`, 16, 16, 8);
    if (mode !== "journey" && (departure || elapsed - chapterAt < 6000) && !dialogue && journeyState?.phase !== "prompt") {
      ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, viewHeight - 28, viewWidth - 16, 20);
      const hint = departure ? nearTravelPoint(departure.departure) ? "SPACE / READ: TRAVEL FROM THIS STOP" : `WALK TO ${departure.departure.label.toUpperCase()} →`
        : "WALK · SPACE TO READ · FOLLOW THE FINISH SIGN →";
      text(hint.slice(0, 75), viewWidth / 2, viewHeight - 22, 7, PAPER, "center");
    }
    if (journeyState?.phase === "prompt" && active) {
      ctx.fillStyle = INK; ctx.fillRect(8, viewHeight - 76, viewWidth - 16, 68);
      ctx.strokeStyle = "#d9c782"; ctx.strokeRect(10, viewHeight - 74, viewWidth - 20, 64);
      text(`TRAVEL TO ${active.arrival.label.toUpperCase()}`.slice(0, 75), 20, viewHeight - 64, 8);
      text(active.legs.map(leg => leg.mode === "bus" ? `Bus ${leg.route}` : leg.mode === "tube" ? `${leg.line} line` : "Walk").join(" → ").slice(0, 80), 20, viewHeight - 48, 7);
      text(`PRESS SPACE / READ AGAIN TO ${active.legs[0].mode === "walk" ? "SET OFF" : "BOARD"} · WALK AWAY TO CANCEL`, 20, viewHeight - 27, 6, "#fff0a8");
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
  function drawTravelPoint(point: TravelPoint, outgoing: boolean, labelOnly = false) {
    const px = point.tile.x * TILE + 8, py = point.tile.y * TILE + 15;
    if (!labelOnly) {
    if (point.kind === "path") {
      ctx.fillStyle = outgoing ? "#dfba64" : "#a4bb94";
      ctx.beginPath(); ctx.moveTo(px - 8, py - 6); ctx.lineTo(px + 7, py - 6); ctx.lineTo(px + 7, py - 11);
      ctx.lineTo(px + 16, py - 3); ctx.lineTo(px + 7, py + 5); ctx.lineTo(px + 7, py); ctx.lineTo(px - 8, py); ctx.fill();
    } else {
      const station = point.kind === "station", width = station ? 64 : 48, height = station ? 58 : 48;
      ctx.drawImage(picture(`/transit/library/${station ? "station" : "bus_stop"}.png`), px - width / 2, py - height, width, height);
    }
    return;
    }
    const label = `${outgoing ? "→ " : ""}${point.label}`.slice(0, 28), width = Math.min(150, label.length * 4 + 12);
    ctx.fillStyle = outgoing ? "#263f35" : "#373543"; ctx.fillRect(px - width / 2, py - 67, width, 14);
    text(label, px, py - 63, 6, PAPER, "center");
  }
  function animateJourneyFeet() {
    if (!journeyState) return;
    const journey = activeJourney(manifest, journeyState);
    if (!journey) return;
    if (journeyState.phase === "boarding") {
      const progress = Math.min(1, journeyState.phaseMs / 1000), bus = journey.legs[0].mode === "bus";
      const target = { x: journey.departure.tile.x * TILE + 8, y: journey.departure.tile.y * TILE + 15 + (bus ? 52 : 0) };
      x = boardingOrigin.x + (target.x - boardingOrigin.x) * progress; y = boardingOrigin.y + (target.y - boardingOrigin.y) * progress;
      const dx = target.x - boardingOrigin.x, dy = target.y - boardingOrigin.y;
      facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up";
      moving = progress < 1;
    } else if (journeyState.phase === "arriving") {
      const progress = Math.min(1, journeyState.phaseMs / journeyPhaseDuration(manifest, journeyState));
      const point = journey.arrival, bus = journey.legs.at(-1)?.mode === "bus";
      const from = { x: point.tile.x * TILE + 8, y: point.tile.y * TILE + 15 + (bus ? 52 : 0) };
      const to = { x: point.approach.x * TILE + 8, y: point.approach.y * TILE + 15 };
      x = from.x + (to.x - from.x) * progress; y = from.y + (to.y - from.y) * progress;
      facing = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? to.x >= from.x ? "right" : "left" : to.y >= from.y ? "down" : "up";
      moving = true;
    }
  }
  function legName(leg: JourneyLeg) { return leg.mode === "bus" ? `BUS ${leg.route}` : leg.mode === "tube" ? `${leg.line.toUpperCase()} LINE` : "ON FOOT"; }
  function legStart(leg: JourneyLeg) { return leg.mode === "tube" ? leg.stations[0] : leg.from; }
  function legEnd(leg: JourneyLeg) { return leg.mode === "tube" ? leg.stations.at(-1)! : leg.to; }
  function drawJourney() {
    if (!journeyState) return;
    const journey = activeJourney(manifest, journeyState);
    if (!journey) { drawWorld(); return; }
    const leg = journey.legs[journeyState.legIndex], progress = Math.min(1, journeyState.phaseMs / journeyPhaseDuration(manifest, journeyState));
    if (journeyState.phase === "boarding" || journeyState.phase === "arriving") {
      drawWorld();
      ctx.fillStyle = INK; ctx.fillRect(8, viewHeight - 30, viewWidth - 16, 22);
      const label = journeyState.phase === "boarding" ? `${journey.legs[0].mode === "walk" ? "STARTING WALK" : "BOARDING"} · ${legName(journey.legs[0])} · SPACE TO SKIP JOURNEY`
        : `ARRIVING AT ${journey.arrival.label.toUpperCase()}`;
      text(label.slice(0, 80), viewWidth / 2, viewHeight - 23, 7, PAPER, "center");
      return;
    }
    ctx.fillStyle = leg.mode === "tube" ? "#292636" : "#a6c9d6"; ctx.fillRect(0, 0, viewWidth, viewHeight);
    if (journeyState.phase === "transfer") {
      ctx.fillStyle = "#c8bda1"; ctx.fillRect(0, 175, viewWidth, viewHeight - 175);
      const station = leg.mode === "tube", image = picture(`/transit/library/${station ? "station" : "bus_stop"}.png`);
      ctx.drawImage(image, viewWidth / 2 + 35, 220 - image.height * 1.4, image.width * 1.4, image.height * 1.4);
      facing = "right"; moving = true; shadow(105 + progress * 165, 238, 18); drawPlayer(105 + progress * 165, 238);
      ctx.fillStyle = INK; ctx.fillRect(12, 12, viewWidth - 24, 72);
      text(`CHANGE AT ${legStart(leg).toUpperCase()}`.slice(0, 70), viewWidth / 2, 29, 9, PAPER, "center");
      text(`NEXT: ${legName(leg)}`, viewWidth / 2, 53, 9, "#ffcf84", "center");
    } else if (leg.mode === "walk") {
      const city = picture("/transit/city.png"), offset = (journeyState.phaseMs * .055) % city.width;
      for (let px = -offset; px < viewWidth; px += city.width) ctx.drawImage(city, Math.round(px), 150 - city.height);
      ctx.fillStyle = "#bcb193"; ctx.fillRect(0, 150, viewWidth, viewHeight - 150);
      ctx.fillStyle = "#a3b482"; ctx.fillRect(0, 168, viewWidth, 29);
      for (let tx = -((journeyState.phaseMs * .08) % 180); tx < viewWidth; tx += 180) ctx.drawImage(picture("/tiles/dq/tree.png"), Math.round(tx), 151);
      for (let col = -1; col < viewWidth / TILE + 1; col++) { ctx.strokeStyle = "#a79c80"; ctx.strokeRect(col * TILE - ((journeyState.phaseMs * .08) % TILE), 222, TILE, 32); }
      facing = "right"; moving = true; shadow(viewWidth / 2, 245, 16); drawPlayer(viewWidth / 2, 245);
    } else {
      if (leg.mode === "bus") {
        const city = picture("/transit/city.png"), offset = (journeyState.phaseMs * .11) % city.width;
        for (let px = -offset; px < viewWidth; px += city.width) ctx.drawImage(city, Math.round(px), 185 - city.height);
        ctx.fillStyle = "#777789"; ctx.fillRect(0, 185, viewWidth, 16);
        ctx.fillStyle = "#4a4a55"; ctx.fillRect(0, 201, viewWidth, 70);
        ctx.fillStyle = "#eee5bd";
        for (let px = -((journeyState.phaseMs * .19) % 80); px < viewWidth; px += 80) ctx.fillRect(Math.round(px), 254, 40, 3);
      } else {
        ctx.fillStyle = "#393443";
        for (let px = -((journeyState.phaseMs * .21) % 64); px < viewWidth; px += 64) ctx.fillRect(Math.round(px), 79, 9, 157);
        ctx.fillStyle = leg.color; ctx.fillRect(0, 85, viewWidth, 8);
        ctx.fillStyle = "#14121c"; ctx.fillRect(0, 239, viewWidth, 23);
        ctx.strokeStyle = "#a6a1a5"; ctx.beginPath(); ctx.moveTo(0, 245); ctx.lineTo(viewWidth, 245); ctx.moveTo(0, 254); ctx.lineTo(viewWidth, 254); ctx.stroke();
      }
      const bus = leg.mode === "bus", vehicle = picture(bus ? "/transit/bus.png" : "/transit/tube.png");
      const width = bus ? 192 : 246, height = bus ? 96 : 88, left = viewWidth / 2 - width / 2, top = 244 - height;
      ctx.drawImage(vehicle, left, top, width, height);
      // The canonical avatar is visibly seated behind the vehicle window, clipped at its sill.
      ctx.save(); ctx.beginPath(); ctx.rect(left + 22, top + 14, width - 48, bus ? 28 : 29); ctx.clip();
      facing = "right"; moving = false; drawPlayer(viewWidth / 2 + 15, top + 54); ctx.restore();
      if (leg.mode === "tube") {
        const station = leg.stations[Math.min(leg.stations.length - 1, Math.floor(progress * leg.stations.length))];
        text(station.toUpperCase().slice(0, 60), viewWidth / 2, 264, 8, "#ffcf84", "center");
      }
    }
    if (journeyState.phase !== "transfer") {
      ctx.fillStyle = INK; ctx.fillRect(12, 12, viewWidth - 24, 67);
      text(legName(leg), viewWidth / 2, 24, 12, "#ffcf84", "center");
      text(`${legStart(leg)} → ${legEnd(leg)}`.slice(0, 75), viewWidth / 2, 49, 8, PAPER, "center");
      text(`LEG ${journeyState.legIndex + 1} OF ${journey.legs.length}`, viewWidth / 2, 65, 6, PAPER, "center");
    }
    ctx.fillStyle = "#f6f1df"; ctx.fillRect(24, viewHeight - 30, viewWidth - 48, 3);
    ctx.fillStyle = "#70a87f"; ctx.fillRect(24, viewHeight - 30, (viewWidth - 48) * progress, 3);
    text("SPACE / READ: SKIP TO ARRIVAL", viewWidth / 2, viewHeight - 17, 6, PAPER, "center");
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
        if (direction && journeyState?.phase === "prompt") changeJourney({ type: "cancel" });
        if (direction) {
          facing = direction; const [dx, dy] = DIR[direction], speed = dt * (manifest.scenes[index].world ? .092 : .064), nx = x + dx * speed, ny = y + dy * speed;
          if (!collision(nx, y)) { moving ||= nx !== x; x = nx; }
          if (!collision(x, ny)) { moving ||= ny !== y; y = ny; }
          const exit = manifest.scenes[index].exit;
          const atExit = manifest.scenes[index].world
            ? Math.abs(x - (exit.x * TILE + 8)) < 12 && Math.abs(y - (exit.y * TILE + 8)) < 22
            : Math.floor(x / TILE) === exit.x && Math.floor(y / TILE) === exit.y;
          if (atExit && (!journeyState || index === manifest.scenes.length - 1)) leaveChapter();
        }
      }
    } else if (mode === "journey") {
      changeJourney({ type: "tick", deltaMs: dt });
      animateJourneyFeet();
    } else if (mode === "transit" && elapsed - transitAt >= transit[transitIndex].duration) {
      if (++transitIndex >= transit.length) nextChapter(); else transitAt = elapsed;
    }
    ctx.imageSmoothingEnabled = false;
    if (mode === "highlight") drawHighlight(); else if (mode === "journey") drawJourney(); else if (mode === "transit") drawTransit(); else drawEnd();
    frameId = requestAnimationFrame(frame);
  }
  enterChapter(); frameId = requestAnimationFrame(frame);
  return { destroy() {
    destroyed = true; cancelAnimationFrame(frameId); observer.disconnect(); keys.clear();
    journeyStatus.remove();
    canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("keyup", keyup); canvas.removeEventListener("blur", clearKeys); canvas.removeEventListener("pointerdown", click);
    window.removeEventListener("blur", clearKeys); disposers.forEach(dispose => dispose()); canvas.remove(); controls.remove();
  } };
}
