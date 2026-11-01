import { resolveDayAsset, type DayManifest, type DayScene, type InteractEffect, type TransitLeg, type TravelPoint, type JourneyLeg, type Journey, type WorldObject } from "@/lib/day";
import { activeJourney, advanceJourney, checkpointJourney, departureJourney, journeyPhaseDuration, journeyStorageKey, restoreJourney, type JourneyEvent, type JourneyState } from "./journey";
import { dayProgressScope } from "../lib/game-progress";
import type { InteractionAction, InteractionAsset } from "../lib/interactions";
import { advanceInteraction, beginInteraction, buildInteractionChoices, commitInteraction, currentInteractionStep, emptyInteractionProgress, findInteractionPath, interactionStorageKey, lookupInteractionAsset, nearbyInteractionActions, restoreInteractionProgress, sceneInteractionId, visibleInteractionScene, type InteractionEvent, type InteractionMenuChoice, type InteractionRun, type WorldPoint } from "./interactions";
import { drawWaterShimmer, renderGround } from "./ground-render";
import { drawWeather, sceneCaption, seedWeatherParticles, tickWeatherParticles, type WeatherParticle } from "./weather";
import { worldCollision } from "./world-layout";
import { BASE_MAPS, FRAMES, MAP_H, MAP_W, TILE, VIEW_H, VIEW_W, groundBlocked, hash, placeLandmark } from "./maps";

// Shadwell's canvas, y-sorted sprites and footprint collisions, driven by day.json.
export type GameHandle = { destroy: () => void };
type Direction = "up" | "down" | "left" | "right";
type Talk = { text: string; icon?: string };
type Sprite = { image: HTMLImageElement; x: number; feet: number; width?: number; height?: number; shadow?: number; player?: boolean; objectId?: string; home?: number; roam?: number; phase?: number };
type Effect = { kind: InteractEffect; x: number; y: number; at: number };
const DIR: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY: Record<string, Direction> = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
const PAPER = "#f6f1df", INK = "#1f1a2e";

export async function createGame(parent: HTMLElement, manifest: DayManifest, manifestUrl: string, onShare?: () => Promise<void> | undefined): Promise<GameHandle> {
  const images = new Map<string, HTMLImageElement>();
  const urls = new Set(["/tiles/dq/water.png", "/tiles/dq-atlas.png", "/tiles/dq/tree.png", "/transit/bus.png", "/transit/tube.png", "/transit/city.png", "/transit/nelson.png", resolveDayAsset(manifest.player.sprite, manifestUrl)]);
  if (manifest.journeys?.length) {
    urls.add("/transit/library/bus_stop.png"); urls.add("/transit/library/station.png");
  }
  if (manifest.player.walkSheet) urls.add(resolveDayAsset(manifest.player.walkSheet, manifestUrl));
  for (const scene of manifest.scenes) {
    for (const supplied of scene.interactionPack?.catalog.assets ?? []) urls.add(resolveDayAsset(supplied.src, manifestUrl));
    if (scene.world) {
      for (const material of ["grass", "flowers", "pavement", "cobble", "road", "kerb"]) urls.add(`/tiles/dq/library/${material}.png`);
      urls.add("/tiles/dq/water.png");
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
  for (const scene of manifest.scenes) for (const supplied of scene.interactionPack?.catalog.assets ?? []) {
    const loaded = images.get(resolveDayAsset(supplied.src, manifestUrl));
    if (!loaded || loaded.width !== supplied.width * (supplied.frames ?? 1) || loaded.height !== supplied.height) throw new Error("Provided interaction artwork does not match its frame layout");
  }
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
  const progressScope = dayProgressScope(manifest);
  let storedJourney: string | null = null;
  if (manifest.journeys?.length) { try { storedJourney = localStorage.getItem(journeyStorageKey(progressScope)); } catch { /* Browsing still works without persistent storage. */ } }
  let journeyState: JourneyState | undefined = manifest.journeys?.length ? restoreJourney(manifest, storedJourney) : undefined;
  let index = journeyState ? Math.max(0, manifest.scenes.findIndex(scene => scene.id === journeyState?.sceneId)) : 0;
  let mode: "highlight" | "transit" | "journey" | "end" = "highlight";
  let boardingOrigin = { x: 0, y: 0 };
  const hasInteractions = manifest.scenes.some(scene => Boolean(scene.interactionPack?.actions.length));
  let savedInteractions: string | null = null;
  if (hasInteractions) { try { savedInteractions = localStorage.getItem(interactionStorageKey(progressScope)); } catch { /* In-memory play remains available. */ } }
  let interactionProgress = restoreInteractionProgress(manifest, savedInteractions);
  let runningInteraction: { run: InteractionRun; action: InteractionAction; path: WorldPoint[]; pages: string[]; page: number } | undefined;
  let menuChoices: InteractionMenuChoice[] = [], menuSelection = 0;
  let x = 0, y = 0, facing: Direction = "up", moving = false, elapsed = 0, chapterAt = 0;
  let dialogue: (Talk & { shown: number; remaining: string[] }) | undefined;
  let blocked = new Set<string>(), talks = new Map<string, Talk>(), sprites: Sprite[] = [];
  let effects: Effect[] = [];
  let groundCache: { scene: number; canvas: HTMLCanvasElement } | undefined;
  const lampsOn = new Set<string>(), spoken = new Map<string, number>();
  let transit: { leg: TransitLeg; change?: string; duration: number }[] = [], transitIndex = 0, transitAt = 0;
  let shareNote = "", destroyed = false;
  let weatherParticles: WeatherParticle[] = [];
  const keys = new Set<Direction>();

  function enterChapter() {
    const scene = manifest.scenes[index];
    cancelInteraction(undefined, false);
    blocked = new Set(); talks = new Map(); sprites = []; dialogue = undefined; effects = []; lampsOn.clear(); spoken.clear();
    viewWidth = scene.world ? 480 : VIEW_W; viewHeight = scene.world ? 320 : VIEW_H;
    canvas.width = viewWidth; canvas.height = viewHeight;
    resize();
    const incoming = journeyState?.phase === "exploring" ? manifest.journeys?.find(item => item.toSceneId === scene.id && journeyState?.completed.includes(item.id)) : undefined;
    const entry = incoming?.arrival.approach ?? scene.spawn;
    x = entry.x * TILE + 8; y = entry.y * TILE + 15; facing = scene.world ? "down" : "up";
    mode = "highlight"; chapterAt = elapsed;
    weatherParticles = seedWeatherParticles(scene.weather, viewWidth, viewHeight);
    if (scene.world) {
      for (const object of scene.world.objects) {
        sprites.push({ image: asset(object.sprite), x: object.x, feet: object.y, width: object.width, height: object.height, objectId: object.id, shadow: Math.min(80, object.width * .65),
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
      sprites.push({ image: asset(scene.food.sprite), x: tile.x * TILE + 8, feet: tile.y * TILE + 11, objectId: "food", width: scene.world ? 32 : undefined, height: scene.world ? 32 : undefined });
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
    if (runningInteraction) { confirmInteraction(); return; }
    if (menuChoices.length) return;
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
    const nearbyDeparture = departure && nearTravelPoint(departure.departure) ? departure : undefined;
    const actions = availableInteractions();
    if (actions.length) { openInteractionMenu(actions, nearbyDeparture); return; }
    if (nearbyDeparture) {
      changeJourney({ type: "prompt", journeyId: nearbyDeparture.id, nearby: true }); return;
    }
    const [dx, dy] = DIR[facing], col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    const target = talks.get(`${col + dx},${row + dy}`);
    if (target && (!manifest.scenes[index].world || visibleScene().food)) { startTalk(target); return; }
    const current = visibleScene(), world = current.world;
    if (world) {
      const food = current.food;
      if (food && Math.hypot(food.tile.x * TILE + 8 - x, food.tile.y * TILE + 11 - y) < 32) {
        startTalk({ text: food.text, icon: food.icon ?? food.sprite }); return;
      }
      const distance = (object: WorldObject) => { const point = objectPosition(object); return Math.hypot(point.x - x, point.y - y); };
      const nearest = world.objects.filter(object => {
        const point = objectPosition(object);
        return object.text && distance(object) < Math.max(34, object.width / 2 + 10) && (point.x - x) * dx + (point.y - y) * dy > -6;
      }).sort((a, b) => distance(a) - distance(b))[0];
      if (nearest) useObject(nearest);
    }
  }
  function objectPosition(object: WorldObject) {
    const sprite = sprites.find(item => item.objectId === object.id);
    return { x: sprite?.x ?? object.x, y: sprite?.feet ?? object.y };
  }
  /** NPCs speak their lines in rotation; interactables run one of a small closed list of effects the renderer draws itself. */
  function useObject(object: WorldObject) {
    if (object.role === "npc") {
      const lines = [object.text!, ...(object.lines ?? [])], turn = spoken.get(object.id) ?? 0;
      spoken.set(object.id, turn + 1);
      const point = objectPosition(object);
      effects.push({ kind: "wave", x: point.x, y: point.y - object.height, at: elapsed });
      startTalk({ text: `${object.name}: ${lines[turn % lines.length]}` });
      return;
    }
    if (object.role === "interactable" && object.effect) {
      if (object.effect === "toggle_lamp") { if (lampsOn.has(object.id)) lampsOn.delete(object.id); else lampsOn.add(object.id); }
      else effects.push({ kind: object.effect, x: object.x, y: object.y - object.height * .55, at: elapsed });
    }
    if (object.text) startTalk({ text: object.text });
  }
  function nearTravelPoint(point: TravelPoint) {
    return Math.hypot(x - (point.approach.x * TILE + 8), y - (point.approach.y * TILE + 15)) < 34;
  }
  function saveJourney() {
    if (!journeyState) return;
    try { localStorage.setItem(journeyStorageKey(progressScope), JSON.stringify(checkpointJourney(manifest, journeyState))); } catch { /* Optional browser persistence. */ }
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
  function visibleScene() {
    const original = manifest.scenes[index];
    return visibleInteractionScene(original, sceneInteractionId(manifest, original), interactionProgress, runningInteraction?.run);
  }
  function availableInteractions() {
    const scene = manifest.scenes[index];
    return nearbyInteractionActions(scene, sceneInteractionId(manifest, scene), interactionProgress, { x, y });
  }
  function interactionTargetName(targetId: string) {
    const scene = manifest.scenes[index];
    return targetId === "food" ? "Your lunch" : scene.world?.objects.find(object => object.id === targetId)?.name ?? "This place";
  }
  function panelButton(label: string, onClick: () => void) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.style.cssText = "min-height:42px;margin:4px 8px 4px 0;border:1px solid #ded3a9;padding:8px 12px;background:#3b4d3a;color:#fff8df;font:inherit;touch-action:manipulation";
    button.addEventListener("click", onClick); return button;
  }
  function openInteractionMenu(actions: InteractionAction[], travel?: Journey) {
    if (mode !== "highlight" || runningInteraction || dialogue || (journeyState && journeyState.phase !== "exploring")) return;
    keys.clear(); moving = false; menuChoices = buildInteractionChoices(actions, travel); menuSelection = 0;
    actionPanel.replaceChildren(); actionPanel.hidden = false; actionPanel.setAttribute("role", "dialog");
    actionPanel.setAttribute("aria-label", travel ? "Nearby actions and travel" : `${interactionTargetName(actions[0].targetId)} actions`);
    const heading = document.createElement("strong"); heading.textContent = travel ? "Choose what to do here" : interactionTargetName(actions[0].targetId); actionPanel.append(heading);
    const description = document.createElement("p"); description.textContent = travel ? "Choose an item action or travel. Escape closes this menu." : "Choose an action. Escape closes this menu."; actionPanel.append(description);
    for (const [choiceIndex, choice] of menuChoices.entries()) {
      const button = panelButton(choice.kind === "action" ? choice.action.label : choice.label, () => selectInteractionChoice(choice));
      button.dataset.choice = String(choiceIndex); actionPanel.append(button);
    }
    actionPanel.append(panelButton("Cancel", () => cancelInteraction(undefined)));
    actionPanel.querySelector<HTMLButtonElement>("button[data-choice]")?.focus({ preventScroll: true });
    actionPanel.scrollIntoView({ block: "nearest" });
  }
  function selectInteractionChoice(choice: InteractionMenuChoice) {
    if (choice.kind === "action") { startInteraction(choice.action); return; }
    const departure = journeyState && departureJourney(manifest, journeyState);
    if (runningInteraction || mode !== "highlight" || !departure || departure.id !== choice.journeyId || !nearTravelPoint(departure.departure)) return;
    cancelInteraction(undefined); changeJourney({ type: "prompt", journeyId: departure.id, nearby: true });
  }
  function saveInteractions() {
    try { localStorage.setItem(interactionStorageKey(progressScope), JSON.stringify(interactionProgress)); } catch { /* All durable outcomes are one atomic write when browser storage is available. */ }
  }
  function cancelInteraction(message?: string, focus = true) {
    runningInteraction = undefined; menuChoices = []; keys.clear(); moving = false;
    actionPanel.hidden = true; actionPanel.replaceChildren();
    if (message) interactionStatus.textContent = message;
    if (focus) canvas.focus({ preventScroll: true });
  }
  function startInteraction(action: InteractionAction) {
    if (runningInteraction || mode !== "highlight" || !availableInteractions().some(item => item.id === action.id)) return;
    const scene = manifest.scenes[index], id = sceneInteractionId(manifest, scene);
    const run = beginInteraction(id, action, interactionProgress);
    // Hidden art retains its original footprint. Never feed the draw-only projection to pathfinding.
    const path = run && findInteractionPath(scene, { x, y }, action.approach);
    if (!run || !path) { cancelInteraction("There is no clear path to this spot."); return; }
    menuChoices = []; keys.clear(); dialogue = undefined; interactionStatus.textContent = "";
    runningInteraction = { run, action, path, pages: [], page: 0 }; canvas.focus({ preventScroll: true });
    renderInteractionPanel();
    if (!path.length) updateInteraction({ type: "approached" });
  }
  function interactionPages(value: string) {
    const pages: string[] = []; let page = "";
    for (const word of value.split(/\s+/)) {
      if (page && page.length + word.length > 280) { pages.push(page); page = word; }
      else page += `${page ? " " : ""}${word}`;
    }
    if (page) pages.push(page); return pages;
  }
  function renderInteractionPanel() {
    const current = runningInteraction;
    if (!current) return;
    const step = currentInteractionStep(current.run, current.action);
    const hadPanelFocus = actionPanel.contains(document.activeElement);
    const focusedControl = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.interactionControl : undefined;
    actionPanel.replaceChildren(); actionPanel.hidden = false; actionPanel.setAttribute("role", "region"); actionPanel.setAttribute("aria-label", "Current action");
    const heading = document.createElement("strong"); heading.textContent = current.action.label; actionPanel.append(heading);
    const body = document.createElement("p"); body.setAttribute("aria-live", "polite");
    body.textContent = current.run.phase === "approach" ? "Walking over…" : step?.type === "say" ? current.pages[current.page] ?? step.text : "Taking a moment…";
    actionPanel.append(body);
    if (step?.type === "say") {
      const next = panelButton(current.page < current.pages.length - 1 ? "Continue reading" : "Continue", confirmInteraction);
      next.dataset.interactionControl = "continue"; actionPanel.append(next);
    }
    const cancel = panelButton("Cancel action", () => cancelInteraction("Action cancelled."));
    cancel.dataset.interactionControl = "cancel"; actionPanel.append(cancel);
    if (hadPanelFocus) (focusedControl === "cancel" ? cancel : actionPanel.querySelector<HTMLButtonElement>('button[data-interaction-control="continue"]') ?? cancel).focus({ preventScroll: true });
    actionPanel.scrollIntoView({ block: "nearest" });
  }
  function updateInteraction(event: InteractionEvent) {
    const current = runningInteraction;
    if (!current) return;
    const before = current.run;
    current.run = advanceInteraction(before, current.action, event);
    if (current.run.direction) facing = current.run.direction;
    if (current.run.phase === "cancelled") { cancelInteraction("Action cancelled."); return; }
    if (current.run.phase === "complete") {
      interactionProgress = commitInteraction(interactionProgress, current.run, current.action); saveInteractions();
      const label = current.action.label;
      cancelInteraction(undefined); interactionStatus.textContent = `${label} completed.`;
      return;
    }
    if (before.phase !== current.run.phase || before.stepIndex !== current.run.stepIndex) {
      const step = currentInteractionStep(current.run, current.action);
      current.pages = step?.type === "say" ? interactionPages(step.text) : []; current.page = 0;
      renderInteractionPanel();
    }
  }
  function confirmInteraction() {
    const current = runningInteraction;
    if (!current || currentInteractionStep(current.run, current.action)?.type !== "say") return;
    if (current.page < current.pages.length - 1) { current.page++; renderInteractionPanel(); }
    else updateInteraction({ type: "confirm" });
  }
  function tickInteraction(dt: number) {
    const current = runningInteraction;
    if (!current) return;
    if (current.run.phase !== "approach") { updateInteraction({ type: "tick", deltaMs: dt }); return; }
    let distance = dt * .085;
    while (current.path.length && distance > 0) {
      const target = current.path[0], dx = target.x - x, dy = target.y - y, length = Math.hypot(dx, dy);
      const travelled = Math.min(distance, length), nx = length ? x + dx / length * travelled : target.x, ny = length ? y + dy / length * travelled : target.y;
      if (collision(nx, ny)) { cancelInteraction("There is no clear path to this spot."); return; }
      if (length > .05) { facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up"; moving = true; }
      x = nx; y = ny; distance -= travelled;
      if (length <= travelled + .01) current.path.shift(); else break;
    }
    if (!current.path.length) updateInteraction({ type: "approached" });
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
    if (event.code === "Escape" && (runningInteraction || menuChoices.length)) { event.preventDefault(); cancelInteraction("Action cancelled."); return; }
    if (event.code === "Escape" && dialogue) { event.preventDefault(); dialogue = undefined; return; }
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
  const actionPanel = document.createElement("section"); actionPanel.hidden = true;
  actionPanel.style.cssText = "width:100%;box-sizing:border-box;line-height:1.6;padding:14px;border:2px solid #ded3a9;color:#f6f1df;background:#292436;font:13px monospace";
  const interactionStatus = document.createElement("p"); interactionStatus.setAttribute("aria-live", "polite");
  interactionStatus.style.cssText = "color:#ded3a9;font:11px monospace;line-height:1.5;text-align:center;margin:5px 8px";
  if (hasInteractions) parent.append(actionPanel, interactionStatus);
  const panelKeydown = (event: KeyboardEvent) => {
    if (event.repeat && (event.code === "Space" || event.code === "Enter")) { event.preventDefault(); return; }
    if (event.code === "Escape") { event.preventDefault(); event.stopPropagation(); cancelInteraction("Action cancelled."); return; }
    if (menuChoices.length && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.code)) {
      event.preventDefault(); event.stopPropagation();
      menuSelection = event.code === "Home" ? 0 : event.code === "End" ? menuChoices.length - 1
        : (menuSelection + (event.code === "ArrowUp" || event.code === "ArrowLeft" ? -1 : 1) + menuChoices.length) % menuChoices.length;
      actionPanel.querySelectorAll<HTMLButtonElement>("button[data-choice]")[menuSelection]?.focus({ preventScroll: true });
    }
  };
  actionPanel.addEventListener("keydown", panelKeydown);
  const disposers: (() => void)[] = [];
  for (const [label, direction] of [["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"], [hasInteractions ? "Action / Read / Travel / Share" : journeyState ? "Read / Travel / Skip / Share" : "Read / Skip / Share", "confirm"]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.setAttribute("aria-label", direction === "confirm" ? "Choose an action, read, travel, skip or share" : `Walk ${direction}`);
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
  if (journeyState || hasInteractions) {
    const restart = document.createElement("button"); restart.type = "button"; restart.textContent = journeyState ? "Restart journey" : "Restart day";
    restart.style.cssText = "min-height:40px;border:1px solid #a6b79a;background:transparent;color:#f6f1df;padding:6px 10px;touch-action:manipulation";
    const reset = () => {
      journeyState = manifest.journeys?.length ? restoreJourney(manifest) : undefined;
      interactionProgress = emptyInteractionProgress(); saveInteractions(); cancelInteraction(undefined, false);
      interactionStatus.textContent = journeyState ? "" : "Day restarted."; index = 0; keys.clear(); shareNote = "";
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
    const light = manifest.scenes[index].weather?.daylight;
    ctx.fillStyle = light === "night" ? "rgba(8,10,24,.45)" : light === "dusk" ? "rgba(40,20,10,.32)" : "rgba(20,16,40,.24)";
    ctx.beginPath(); ctx.ellipse(px + 1, py - 1, width / 2, light === "dusk" ? 4.5 : 3, 0, 0, Math.PI * 2); ctx.fill();
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
      if (tile === "p" && base.rows[row][col - 1] === "w" && base.rows[row][col + 1] === "w") {
        ctx.fillStyle = "#6b4428"; ctx.fillRect(col * TILE, row * TILE, 2, TILE); ctx.fillRect(col * TILE + TILE - 2, row * TILE, 2, TILE);
      }
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
    drawWeather(ctx, scene.weather, weatherParticles, VIEW_W, VIEW_H, { x, y });
    if (elapsed - chapterAt < 1900) {
      ctx.fillStyle = INK; ctx.fillRect(6, 6, VIEW_W - 12, 24);
      text(sceneCaption(scene.time, scene.title, scene.weather), VIEW_W / 2, 14, 8, PAPER, "center");
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
    const step = runningInteraction && currentInteractionStep(runningInteraction.run, runningInteraction.action);
    const supplied = step?.type === "animate" ? manifest.scenes[index].interactionPack?.catalog.assets.find(item => item.id === step.assetId) : undefined;
    if (supplied?.kind === "pose" && mode === "highlight") drawSuppliedAsset(supplied, px, py, runningInteraction?.run.elapsedMs ?? 0);
    else if (walkSheet) {
      const row = { down: 0, left: 1, right: 2, up: 3 }[facing];
      const frame = moving ? 1 + Math.floor(elapsed / 135) % 2 : 0;
      ctx.drawImage(walkSheet, frame * 32, row * 48, 32, 48, Math.round(px - 16), Math.round(py - 48), 32, 48);
    } else ctx.drawImage(playerImage, Math.round(px - 16), Math.round(py - 48), 32, 48);
    const held = lookupInteractionAsset(manifest, runningInteraction ? runningInteraction.run.carried : interactionProgress.carried);
    if (held) drawSuppliedAsset(held, px + (facing === "left" ? -11 : facing === "right" ? 11 : 8), py - 16 + (held.anchor ? 0 : held.height / 2), elapsed);
  }
  function drawSuppliedAsset(supplied: InteractionAsset, px: number, py: number, time: number) {
    const frame = Math.floor(time / (supplied.frameMs ?? 160)) % (supplied.frames ?? 1);
    const anchor = supplied.anchor ?? { x: supplied.width / 2, y: supplied.height };
    ctx.drawImage(asset(supplied.src), frame * supplied.width, 0, supplied.width, supplied.height,
      Math.round(px - anchor.x), Math.round(py - anchor.y), supplied.width, supplied.height);
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
    const scene = visibleScene(), world = scene.world!;
    // Keep an NPC still while the player reads or chooses an action, and use the
    // same visible position when checking whether that NPC is within reach.
    if (!dialogue && !runningInteraction && !menuChoices.length) for (const sprite of sprites) {
      if (sprite.roam) sprite.x = Math.round((sprite.home ?? sprite.x) + Math.sin(elapsed / 1400 + (sprite.phase ?? 0)) * sprite.roam);
    }
    const visibleSprites = sprites.filter(sprite => !sprite.objectId || (sprite.objectId === "food" ? Boolean(scene.food) : world.objects.some(object => object.id === sprite.objectId)));
    const cameraX = Math.round(Math.max(0, Math.min(world.width * TILE - viewWidth, x - viewWidth / 2)));
    const cameraY = Math.round(Math.max(0, Math.min(world.height * TILE - viewHeight, y - viewHeight * .62)));
    ctx.fillStyle = "#85a77b"; ctx.fillRect(0, 0, viewWidth, viewHeight);
    ctx.save(); ctx.translate(-cameraX, -cameraY);
    if (groundCache?.scene !== index) groundCache = { scene: index, canvas: renderGround(world, picture) };
    ctx.drawImage(groundCache.canvas, 0, 0);
    drawWaterShimmer(ctx, world, elapsed, cameraX, cameraY, viewWidth, viewHeight);
    // Painted road markings and a pedestrian crossing keep a street legible. Layouts without a road have none.
    if (world.crossing) {
      const { col: crossCol, row: crossRow, rows: crossRows } = world.crossing;
      ctx.fillStyle = "#eee5bc";
      for (let col = 0; col < world.width; col += 4) if (col < crossCol - 1 || col > crossCol + 4) ctx.fillRect(col * TILE, (crossRow + crossRows / 2) * TILE - 2, 24, 2);
      ctx.fillStyle = "#ece7d2";
      for (let row = crossRow; row < crossRow + crossRows; row++) ctx.fillRect(crossCol * TILE, row * TILE + 3, 64, 7);
    }
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
    for (const sprite of visibleSprites) if (sprite.shadow) shadow(sprite.x, sprite.feet, sprite.shadow);
    const hidePlayer = journeyState?.phase === "boarding" && journeyState.phaseMs > 1050;
    if (!hidePlayer) shadow(x, y, 15);
    const entities: Sprite[] = hidePlayer ? [...visibleSprites] : [...visibleSprites, { image: playerImage, x, feet: y, player: true }];
    for (const sprite of entities.sort((a, b) => a.feet - b.feet)) {
      if (sprite.player) { drawPlayer(sprite.x, sprite.feet); continue; }
      const width = sprite.width ?? sprite.image.width, height = sprite.height ?? sprite.image.height;
      ctx.drawImage(sprite.image, Math.round(sprite.x - width / 2), Math.round(sprite.feet - height), width, height);
    }
    const animated = runningInteraction && currentInteractionStep(runningInteraction.run, runningInteraction.action);
    const effect = animated?.type === "animate" ? scene.interactionPack?.catalog.assets.find(item => item.id === animated.assetId && item.kind === "effect") : undefined;
    if (effect) drawSuppliedAsset(effect, x, y - 45, runningInteraction?.run.elapsedMs ?? 0);
    drawEffects(world);
    if (incoming) drawTravelPoint(incoming.arrival, false, true);
    if (departure) drawTravelPoint(departure.departure, true, true);
    if (!journeyState || index === manifest.scenes.length - 1) {
      const exitX = scene.exit.x * TILE + 8, exitY = scene.exit.y * TILE + 8;
      ctx.fillStyle = "#274c3b"; ctx.fillRect(exitX - 31, exitY - 27, 36, 18);
      text("FINISH →", exitX - 13, exitY - 22, 6, PAPER, "center");
      text("▶", exitX - 4, exitY - 3, 11, "#fff6b0");
    }
    ctx.restore();
    drawWeather(ctx, scene.weather, weatherParticles, viewWidth, viewHeight, { x: x - cameraX, y: y - cameraY });
    ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, 8, viewWidth - 16, 25);
    text(sceneCaption(scene.time, scene.title, scene.weather), 16, 16, 7);
    if (mode !== "journey" && !runningInteraction && !menuChoices.length && (departure || elapsed - chapterAt < 6000) && !dialogue && journeyState?.phase !== "prompt") {
      ctx.fillStyle = "rgba(31,26,46,.88)"; ctx.fillRect(8, viewHeight - 28, viewWidth - 16, 20);
      const hint = departure ? nearTravelPoint(departure.departure) ? "SPACE / READ: TRAVEL FROM THIS STOP" : `WALK TO ${departure.departure.label.toUpperCase()} →`
        : "WALK · SPACE TO READ · FOLLOW THE FINISH SIGN →";
      text(hint.slice(0, 75), viewWidth / 2, viewHeight - 22, 7, PAPER, "center");
    }
    const nearbyActions = mode === "highlight" && !dialogue && !runningInteraction && !menuChoices.length && (!journeyState || journeyState.phase === "exploring") ? availableInteractions() : [];
    if (nearbyActions.length) {
      ctx.fillStyle = INK; ctx.fillRect(8, viewHeight - 30, viewWidth - 16, 22);
      const hint = departure && nearTravelPoint(departure.departure) ? "SPACE / ACTION: CHOOSE ITEM ACTION OR TRAVEL" : `SPACE / ACTION: ${interactionTargetName(nearbyActions[0].targetId)}`;
      text(hint.slice(0, 72), viewWidth / 2, viewHeight - 23, 7, "#fff0a8", "center");
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
      tickWeatherParticles(weatherParticles, dt, viewWidth, viewHeight, manifest.scenes[index].weather);
      if (runningInteraction) tickInteraction(dt);
      else if (menuChoices.length) { /* The menu owns input until an action or Cancel is chosen. */ }
      else if (dialogue) dialogue.shown = Math.min(dialogue.text.length, dialogue.shown + dt * .04);
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
    journeyStatus.remove(); actionPanel.removeEventListener("keydown", panelKeydown); actionPanel.remove(); interactionStatus.remove();
    canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("keyup", keyup); canvas.removeEventListener("blur", clearKeys); canvas.removeEventListener("pointerdown", click);
    window.removeEventListener("blur", clearKeys); disposers.forEach(dispose => dispose()); canvas.remove(); controls.remove();
  } };
}
