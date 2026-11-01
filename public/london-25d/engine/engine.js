// DayQuest 2.5D engine — vanilla canvas, y-sorted sprites, footprint collisions.
// Scenes register themselves with DQ.scene({...}); see README.md for the scene API.
(() => {
  "use strict";

  const T = 32;
  const BASE_W = 480;
  const BASE_H = 320;
  const FW = 32, FH = 48;
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const HIT = { w: 14, h: 6 };
  const SHARED = ["shawn", "bus", "tube_train", "nelson", "skyline", "national_gallery", "tube_tunnel",
    "tile_paving", "tile_asphalt", "tile_kerb", "shop_corner", "shop_cafe", "shop_laundry", "tree"];
  const OPTIONAL = ["actions", "fx_steam", "fx_sparkle", "fx_heart", "fx_flash", "skyline_far", "terrace_strip"]; // loaded if present
  const NPC_VEHICLES = ["black_cab", "delivery_bike"];
  const SITTABLE = ["bench", "deckchair", "chair"];
  // player action strips in shared/assets/actions.png (4 cols x 6 rows of 32x48)
  const ACT = {
    eat: { row: 0, seq: [0, 1, 2, 3], speed: 9, loop: true, seated: true },
    drink: { row: 1, seq: [0, 1, 2, 1, 0], speed: 12, seated: true },
    sit: { row: 2, seq: [0, 1], speed: 10, bob: true },
    photo: { row: 3, seq: [0, 1], speed: 16, flashAt: 1 },
    wave: { row: 4, seq: [0, 1, 2, 1], speed: 8, loop: true },
    point: { row: 5, seq: [0, 1], speed: 12 },
  };
  const MARGIN = 24; // tiles of ground drawn past each map edge, so the canvas never shows empty space

  const scenes = [];
  const DQ = (window.DQ = { T, scenes, scene: (def) => scenes.push(def) });

  // ---------- assets ----------
  const cache = {};
  function assetPath(scene, name) {
    if (scene && (scene.own || []).includes(name)) return `scenes/${scene.dir || scene.id}/assets/${name}.png`;
    if (name.startsWith("npc_") || NPC_VEHICLES.includes(name)) return `shared/npcs/assets/${name}.png`;
    return `shared/assets/${name}.png`;
  }
  function load(path) {
    if (cache[path]) return cache[path];
    const src = (window.ASSET_DATA && window.ASSET_DATA[path]) || path;
    const once = (url) => new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    // one retry: a busy dev server occasionally drops a request
    cache[path] = once(src).catch(() => once(src + (src.startsWith("data:") ? "" : "?retry")))
      .catch(() => { throw new Error("missing asset " + path); });
    return cache[path];
  }

  // recolour the red doors/front of the tube train for another line
  function tint(im, hex) {
    const c = document.createElement("canvas");
    c.width = im.width; c.height = im.height;
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2];
      if (d.data[i + 3] && r > 120 && r > gg * 1.8 && r > b * 1.8) {
        const k = r / 220;
        d.data[i] = Math.min(255, tr * k); d.data[i + 1] = Math.min(255, tg * k); d.data[i + 2] = Math.min(255, tb * k);
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  // ---------- canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let viewW = BASE_W, viewH = BASE_H, scale = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    scale = Math.max(1, Math.floor(Math.min(w / BASE_W, h / BASE_H)));
    viewW = Math.ceil(w / scale);
    viewH = Math.ceil(h / scale);
    canvas.width = viewW;
    canvas.height = viewH;
    canvas.style.width = viewW * scale + "px";
    canvas.style.height = viewH * scale + "px";
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", resize);

  // ---------- world ----------
  let world = null; // the running scene instance
  const player = { x: 0, y: 0, dir: "up", anim: 0, still: 0, moving: false };

  async function buildScene(def) {
    const names = new Set([...SHARED, ...(def.assets || [])]);
    const img = {};
    // pedestrians and vehicles are optional: a scene still runs if their sheets aren't there
    const optional = (n) => n.startsWith("npc_") || NPC_VEHICLES.includes(n);
    await Promise.all([...names].filter((n) => !optional(n)).map(async (n) => (img[n] = await load(assetPath(def, n)))));
    await Promise.all([...names].filter(optional).map((n) => load(assetPath(def, n)).then((i) => (img[n] = i), () => {})));
    await Promise.all(OPTIONAL.map((n) => load(assetPath(def, n)).then((i) => (img[n] = i), () => {})));
    const w = {
      def, img, W: def.cols * T, H: def.rows * T,
      entities: [], talk: [], blocks: [], invented: [], exits: [], movers: [], backdrops: [],
      solid: new Uint8Array(def.cols * def.rows), npcs: [],
    };
    // builder API handed to scene.build()
    const api = {
      T, img, W: w.W, H: w.H,
      // add a sprite; (x, baseY) = left edge and the ground line it stands on
      add(name, x, baseY, o = {}) {
        const im = img[name];
        if (!im) throw new Error(`${def.id}: asset ${name} not listed in assets`);
        const e = { name, im, x: Math.round(x), y: Math.round(baseY), w: im.width, h: im.height,
          invented: !!o.invented, shadow: o.shadow ?? "ellipse", flip: !!o.flip, z: o.z ?? 0,
          // "ground": flat things (stairs, decals, rugs) drawn under everything that stands up
          layer: o.layer === "ground" ? "ground" : "upright" };
        const depth = o.depth ?? Math.min(12, Math.round(im.height * 0.3));
        const [fx, fw] = o.foot ?? [Math.round(im.width * 0.1), Math.round(im.width * 0.8)];
        e.box = o.solid === false ? null : { x: e.x + fx, y: e.y - depth, w: fw, h: depth };
        if (o.talk) w.talk.push({ x: e.x + e.w / 2, y: e.y, text: o.talk, icon: o.icon });
        w.entities.push(e);
        return e;
      },
      // a point of interest: stand near (x, y) facing it and press A
      // o.action: "eat" | "drink" | "sit" | "photo" | "wave" | "point"; o.seat {x, y} moves the player there first;
      // o.fx: "fx_steam" etc. drawn at o.fxAt {x, y}
      talk(x, y, text, o = {}) { w.talk.push({ x, y, text, icon: o.icon, action: o.action, seat: o.seat, fx: o.fx, fxAt: o.fxAt }); },
      // a pedestrian walking a waypoint loop: sheet = 3x4 walk sheet (down/left/right/up)
      npc(sheet, o) {
        const pts = o.path;
        const n = { sheet: img[sheet], x: pts[0][0], y: pts[0][1], path: pts, i: 1, speed: o.speed ?? 0.55, dir: "down",
          anim: 0, wait: o.delay ?? 0, pause: o.pause ?? 0, invented: o.invented ?? true, still: !!o.still, face: o.face || "down" };
        if (!n.sheet) return null;
        if (o.talk) w.talk.push({ npc: n, x: n.x, y: n.y, text: o.talk });
        w.npcs.push(n);
        return n;
      },
      // a vehicle crossing the map on a lane, then waiting off-screen
      traffic(name, o) {
        const im = img[name];
        if (!im) return null;
        const dir = o.speed >= 0 ? 1 : -1;
        const start = dir > 0 ? -im.width - 20 : w.W + 20;
        return api.mover(name, { x: start + (o.offset || 0) * dir, y: o.y, flip: !!o.flip, invented: o.invented ?? true, shadow: "ellipse", update(m) {
          if (m.wait > 0) { m.wait--; m.visible = false; return; }
          m.visible = true;
          m.x += o.speed;
          if ((dir > 0 && m.x > w.W + 20) || (dir < 0 && m.x < -im.width - 20)) { m.x = start; m.wait = o.gap ?? 300; }
        } });
      },
      block(x, y, bw, bh) { w.blocks.push({ x, y, w: bw, h: bh }); },
      invented(x, y, iw, ih) { w.invented.push({ x, y, w: iw, h: ih }); },
      // stepping into this rect leaves the scene
      exit(x, y, ew, eh, o = {}) { w.exits.push({ x, y, w: ew, h: eh, label: o.label || "EXIT" }); },
      // stepping into this rect switches straight to another scene (e.g. a shop interior), no transit
      door(x, y, dw, dh, o) { w.exits.push({ x, y, w: dw, h: dh, label: o.label || "", door: { to: o.to, at: o.at } }); },
      // something that moves on its own: update(m, frame) changes m.x / m.y / m.flip
      mover(name, o) {
        const m = { name, im: img[name], x: o.x, y: o.y, flip: !!o.flip, invented: !!o.invented,
          update: o.update, shadow: o.shadow ?? "none", z: o.z ?? 0, visible: true };
        w.movers.push(m);
        return m;
      },
      // drawn behind everything, before the ground; parallax 0 = fixed to the world, 1 = fixed to the screen
      // repeatX: tile the backdrop across the whole map width (city skylines)
      backdrop(name, x, y, o = {}) { w.backdrops.push({ im: img[name], x, y, p: o.parallax ?? 0.3, invented: !!o.invented, repeatX: !!o.repeatX }); },
      // a hazy row of city rooftops standing on the line y, across the whole map
      // depth: a hazy far skyline (only roofs and spires show) behind a continuous terrace that meets the ground at y
      skyline(y, o = {}) {
        // setback: the terrace stands on its own pavement this far behind the frontage line, so it reads as the next street
        const far = img.skyline_far || img.skyline, row = img.terrace_strip, by = y - (o.setback ?? 0);
        const roof = row ? by - row.height + 24 : by;
        w.backdrops.push({ im: far, x: 0, y: roof + 40 - far.height, p: o.parallax ?? 0.3, invented: !!o.invented, repeatX: true });
        if (row) w.backdrops.push({ im: row, x: 0, y: by - row.height, p: 0, invented: !!o.invented, repeatX: true, ground: true });
      },
    };
    def.build(api);
    // ground
    const g = document.createElement("canvas");
    g.width = w.W + 2 * MARGIN * T; g.height = w.H + 2 * MARGIN * T;
    const gc = g.getContext("2d");
    gc.imageSmoothingEnabled = false;
    for (let r = -MARGIN; r < def.rows + MARGIN; r++) {
      for (let c = -MARGIN; c < def.cols + MARGIN; c++) {
        const inside = r >= 0 && c >= 0 && r < def.rows && c < def.cols;
        // past the edge, repeat the nearest edge tile (keeps texture alignment via c, r)
        let t = def.ground(Math.min(def.cols - 1, Math.max(0, c)), Math.min(def.rows - 1, Math.max(0, r)));
        if (!t) continue;
        if (typeof t === "string") t = { tile: t };
        if (t.solid && inside) w.solid[r * def.cols + c] = 1;
        const im = img[t.tile];
        if (!im) throw new Error(`${def.id}: tile ${t.tile} not listed in assets`);
        const x = (c + MARGIN) * T, y = (r + MARGIN) * T;
        gc.save();
        if (t.flipY) { gc.translate(x, y + T); gc.scale(1, -1); } else gc.translate(x, y);
        // textures bigger than a tile cover several cells; draw the matching part
        const nx = im.width / T, ny = im.height / T;
        const sx = (((c - (t.ox || 0)) % nx) + nx) % nx, sy = (((r - (t.oy || 0)) % ny) + ny) % ny;
        gc.drawImage(im, sx * T, (t.flipY ? ny - 1 - sy : sy) * T, T, T, 0, 0, T, T);
        gc.restore();
      }
    }
    w.ground = g;
    w.train = { tube: tint(img.tube_train, "#B36305") };
    return w;
  }

  function collides(px, py) {
    const l = px - HIT.w / 2, r = px + HIT.w / 2, t = py - HIT.h, b = py;
    const top = world.def.walkTop ?? 0;
    if (l < 4 || r > world.W - 4 || t < top || b > world.H - 4) return true;
    const c0 = Math.floor(l / T), c1 = Math.floor((r - 1) / T), r0 = Math.floor(t / T), r1 = Math.floor((b - 1) / T);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (world.solid[rr * world.def.cols + cc]) return true;
    const hit = (k) => k && r > k.x && l < k.x + k.w && b > k.y && t < k.y + k.h;
    for (const e of world.entities) if (hit(e.box)) return true;
    for (const k of world.blocks) if (hit(k)) return true;
    for (const n of world.npcs) if (hit({ x: n.x - 6, y: n.y - 6, w: 12, h: 6 })) return true;
    return false;
  }

  // ---------- input ----------
  const keys = new Set();
  const KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ShiftLeft: "run", ShiftRight: "run", Space: "a", Enter: "a", KeyZ: "a",
  };
  window.addEventListener("keydown", (ev) => {
    if (ev.code === "KeyI") { toggleInvented(); return; }
    if (ev.code === "Escape") { showPicker(); return; }
    const k = KEYMAP[ev.code];
    if (!k) return;
    ev.preventDefault();
    if (k === "a" && !ev.repeat) pressA();
    keys.add(k);
  });
  window.addEventListener("keyup", (ev) => { const k = KEYMAP[ev.code]; if (k) keys.delete(k); });
  window.addEventListener("blur", () => keys.clear());

  const touchEl = document.getElementById("touch");
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) touchEl.hidden = false;
  for (const b of touchEl.querySelectorAll("button")) {
    const k = b.dataset.key;
    const on = (ev) => { ev.preventDefault(); b.classList.add("on"); if (k === "a") pressA(); else keys.add(k); };
    const off = (ev) => { ev.preventDefault(); b.classList.remove("on"); keys.delete(k); };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointercancel", off);
    b.addEventListener("pointerleave", off);
  }

  // ---------- UI: picker, banner, dialogue, overlay ----------
  const pickerEl = document.getElementById("title");
  const pickerList = document.getElementById("scene-list");
  const bannerEl = document.getElementById("banner");
  const dlg = document.getElementById("dialogue");
  const dlgText = document.getElementById("dialogue-text");
  const dlgIcon = document.getElementById("dialogue-icon");
  const dlgNext = document.getElementById("dialogue-next");
  const invBtn = document.getElementById("toggle-invented");
  const legend = document.getElementById("legend");
  const transitEl = document.getElementById("transit");
  const endEl = document.getElementById("end");
  let mode = "picker"; // picker | play | transit | end
  let dialogue = null;
  let showInvented = false;
  let bannerTimer = 0;
  let exitCooldown = 0; // frames after entering a scene before exits/doors fire again

  function chain() { return scenes.filter((s) => s.order != null).sort((a, b) => a.order - b.order); }

  function renderPicker() {
    pickerList.innerHTML = "";
    const play = document.createElement("button");
    play.className = "primary";
    play.textContent = "▶ Play the day";
    play.onclick = () => enter(chain()[0]);
    pickerList.append(play);
    for (const s of [...chain(), ...scenes.filter((x) => x.order == null && !x.hidden)]) {
      const b = document.createElement("button");
      b.innerHTML = `<span>${s.time || "Bonus"}</span>${s.title}`;
      b.onclick = () => enter(s);
      pickerList.append(b);
    }
  }
  function showPicker() {
    mode = "picker";
    dialogue = null; dlg.hidden = true; transitEl.hidden = true; endEl.hidden = true;
    pickerEl.hidden = false;
    pickerList.querySelector("button")?.focus();
  }

  async function enter(def, at) {
    pickerEl.hidden = true; endEl.hidden = true;
    world = await buildScene(def);
    const sp = at || def.spawn;
    player.x = sp.x; player.y = sp.y; player.dir = sp.dir || "up"; player.still = 0;
    resize();
    mode = "play";
    bannerEl.textContent = def.card || def.title;
    bannerEl.hidden = false;
    bannerTimer = 90;
    exitCooldown = 30;
    // remember what this scene looks like for the clip preview (once the banner has gone)
    if (def.order != null) setTimeout(() => { if (world && world.def === def && mode === "play") snapshots[def.order - 1] = canvas.toDataURL(); }, 1700);
    const url = new URL(location.href);
    url.searchParams.set("scene", def.id);
    history.replaceState(null, "", url);
  }

  function nearbyTalk() {
    const ahead = { up: [0, -14], down: [0, 14], left: [-14, -4], right: [14, -4] }[player.dir];
    const fx = player.x + ahead[0], fy = player.y + ahead[1];
    let best = null, bestD = 30;
    for (const s of world.talk) {
      if (s.npc) { s.x = s.npc.x; s.y = s.npc.y; }
      const d = Math.hypot(s.x - fx, (s.y - fy) * 1.4);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  function pressA() {
    if (mode === "transit") { transit.skip = true; return; }
    if (mode !== "play") return;
    if (dialogue) {
      if (dialogue.shown < dialogue.text.length) dialogue.shown = dialogue.text.length;
      else { dialogue = null; dlg.hidden = true; }
      return;
    }
    const s = nearbyTalk();
    if (s && s.action) startAction(s.action, s);
    else {
      // benches and deckchairs seat the player, with or without a line to read
      const seat = nearbySeat();
      // a deckchair's seat is low and set back: sit into it rather than in front of it
      if (seat) startAction("sit", { seat: { x: seat.x + seat.w / 2, y: seat.name === "deckchair" ? seat.y - 6 : seat.y + 2 } });
    }
    if (!s) return;
    if (s.text) {
      // keep numbers with their units on one line ("96 m", "3.8 km")
      dialogue = { text: s.text.replace(/(\d) (?=(m|km|ft|kg|tonnes?|minutes?|min|steps|%)\b)/g, "$1\u00a0"), shown: 0 };
      dlgIcon.hidden = !s.icon;
      if (s.icon) dlgIcon.src = world.img[s.icon].src;
      dlg.hidden = false;
      player.still = 0;
    }
  }

  // ---------- player actions (sit, eat, drink, photo, wave, point) ----------
  let flashTimer = 0;
  function nearbySeat() {
    const ahead = { up: [0, -10], down: [0, 10], left: [-12, -4], right: [12, -4] }[player.dir];
    const fx = player.x + ahead[0], fy = player.y + ahead[1];
    return world.entities.find((e) => SITTABLE.includes(e.name) && fx > e.x - 6 && fx < e.x + e.w + 6 && fy > e.y - e.h - 6 && fy < e.y + 8);
  }
  function startAction(name, s) {
    if (!world.img.actions && name !== "sit") return;
    player.act = { name, t: 0, prev: { x: player.x, y: player.y, dir: player.dir }, seat: s.seat, fx: s.fx, fxAt: s.fxAt, flashed: false };
    if (s.seat) { player.x = s.seat.x; player.y = s.seat.y; player.dir = s.seat.dir || "down"; }
    player.still = 0;
  }
  function standUp() {
    const a = player.act;
    if (a.seat) { player.x = a.prev.x; player.y = a.prev.y; }
    player.act = null;
  }

  function toggleInvented() {
    showInvented = !showInvented;
    invBtn.setAttribute("aria-pressed", String(showInvented));
    invBtn.textContent = "Invented: " + (showInvented ? "on" : "off");
    legend.hidden = !showInvented;
  }
  invBtn.addEventListener("click", (ev) => { ev.stopPropagation(); toggleInvented(); invBtn.blur(); });
  document.getElementById("btn-menu").addEventListener("click", (ev) => { ev.stopPropagation(); showPicker(); ev.target.blur(); });
  document.getElementById("end-again").addEventListener("click", () => enter(chain()[0]));

  // ---------- mock "share as video clip": a short render bar, then a looping preview of the day ----------
  const snapshots = []; // one canvas snapshot per scene, taken shortly after entering it
  const clipEl = document.getElementById("clip"), toastEl = document.getElementById("toast");
  let clipTimer = 0;
  function toast(text) { toastEl.textContent = text; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.hidden = true), 1400); }
  document.getElementById("end-clip").addEventListener("click", () => {
    const render = document.getElementById("clip-render"), ready = document.getElementById("clip-ready"), bar = document.getElementById("clip-bar");
    clipEl.hidden = false; render.hidden = false; ready.hidden = true; bar.style.width = "0";
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 2000);
      bar.style.width = `${p * 100}%`;
      if (p < 1) return requestAnimationFrame(tick);
      render.hidden = true; ready.hidden = false;
      const shots = snapshots.filter(Boolean), frames = shots.length ? shots : [canvas.toDataURL()];
      let i = 0;
      const img = document.getElementById("clip-frame");
      img.src = frames[0];
      clearInterval(clipTimer);
      clipTimer = setInterval(() => { i = (i + 1) % frames.length; img.src = frames[i]; }, 900);
    };
    requestAnimationFrame(tick);
  });
  for (const b of clipEl.querySelectorAll("[data-toast]")) b.addEventListener("click", () => toast(b.dataset.toast));
  document.getElementById("clip-close").addEventListener("click", () => { clipEl.hidden = true; clearInterval(clipTimer); });
  document.getElementById("end-menu").addEventListener("click", showPicker);

  // ---------- transit between scenes ----------
  let transit = null;
  function startTransit(def) {
    const order = chain();
    const i = order.indexOf(def);
    const next = order[i + 1];
    if (!next) { mode = "end"; bannerEl.hidden = true; endEl.hidden = false; return; }
    mode = "transit";
    bannerEl.hidden = true; bannerTimer = 0;
    transit = { legs: def.transit || [], leg: 0, t: 0, next, skip: false };
    transitEl.hidden = false;
  }
  function updateTransit() {
    const tr = transit;
    const leg = tr.legs[tr.leg];
    tr.t++;
    if (!leg || tr.t > (leg.frames || 240) || tr.skip) {
      tr.leg++; tr.t = 0; tr.skip = false;
      if (tr.leg >= tr.legs.length) { transitEl.hidden = true; enter(tr.next); }
    }
  }
  function drawTransit() {
    const tr = transit, leg = tr.legs[tr.leg];
    if (!leg) return;
    const w = viewW, h = viewH;
    const p = Math.min(1, tr.t / (leg.frames || 240));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const I = world.img;
    // repeat an image across the screen, scrolled by `off` px
    const strip = (im, off, y, step = im.width) => { for (let x = -(((off % step) + step) % step); x < w; x += step) ctx.drawImage(im, Math.round(x), Math.round(y)); };
    if (leg.mode === "bus") {
      // Whitehall → Trafalgar Square → Charing Cross Road: layered street scrolling past the bus
      const kerbY = Math.round(h * 0.66), baseY = kerbY - 2 * T, off = tr.t * 2.2;
      ctx.fillStyle = "#a9d4f5"; ctx.fillRect(0, 0, w, h);
      const far = I.skyline_far || I.skyline, terr = I.terrace_strip;
      const roof = terr ? baseY + 4 - terr.height + 24 : baseY;
      strip(far, off * 0.3, roof + 40 - far.height, far.width - 1);
      if (terr) strip(terr, off * 0.85, baseY + 4 - terr.height, terr.width - 1);
      for (let x = -((off % T) + T) % T; x < w; x += T) {
        ctx.drawImage(I.tile_paving, x, baseY); ctx.drawImage(I.tile_paving, x, baseY + T);
        ctx.drawImage(I.tile_kerb, x, kerbY);
        for (let y = kerbY + T; y < h; y += T) ctx.drawImage(I.tile_asphalt, x, y);
      }
      // the street front: terraces, then the square with the gallery and Nelson's Column, then terraces again
      const row = [["shop_cafe", 0], ["shop_corner", 84], ["shop_laundry", 178], ["national_gallery", 330], ["shop_cafe", 700], ["shop_corner", 784], ["shop_laundry", 878]];
      const x0 = w * 0.55 - off + 120;
      for (const [n, x] of row) ctx.drawImage(I[n], Math.round(x0 + x), baseY - I[n].height + 4);
      for (const tx of [300, 640]) ctx.drawImage(I.tree, Math.round(x0 + tx), baseY + 10 - I.tree.height);
      const n = I.nelson;
      ctx.fillStyle = "rgba(20,16,40,.22)"; ctx.beginPath(); ctx.ellipse(Math.round(x0 + 480 + n.width / 2 + 3), baseY + 26, n.width * 0.55, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(n, Math.round(x0 + 480), baseY + 26 - n.height);
      const b = I.bus, bx = Math.round(w / 2 - b.width / 2), by = Math.round(kerbY + T * 1.6 - b.height + (tr.t % 20 < 10 ? 0 : 1));
      ctx.fillStyle = "rgba(20,16,40,.25)"; ctx.fillRect(bx + 8, by + b.height - 3, b.width - 8, 6);
      ctx.drawImage(b, bx, by);
      // destination blind
      ctx.fillStyle = "#111"; ctx.fillRect(bx + b.width - 74, by + 7, 50, 9);
      ctx.fillStyle = "#ffd23f"; ctx.font = "bold 7px monospace";
      ctx.fillText(`${leg.route} ${leg.destination}`.toUpperCase().slice(0, 13), bx + b.width - 72, by + 14);
    } else {
      // tube tunnel: cast-iron rings rush past, train runs on the track
      const off = tr.t * 7;
      for (let y = 0; y < h; y += I.tube_tunnel.height) strip(I.tube_tunnel, off, y);
      const railY = Math.round(h * 0.84);
      ctx.fillStyle = "#1c1820"; ctx.fillRect(0, railY, w, h - railY);
      ctx.fillStyle = "#8d8a92"; ctx.fillRect(0, railY + 6, w, 2); ctx.fillRect(0, railY + 16, w, 2);
      ctx.fillStyle = "#3a3340";
      for (let x = -((off * 1.4) % 24); x < w; x += 24) ctx.fillRect(Math.round(x), railY + 4, 6, 18);
      const im = leg.line === "Bakerloo" ? world.train.tube : I.tube_train;
      const tx = Math.round(-im.width * 2 + p * (w + im.width * 3));
      ctx.drawImage(im, tx, railY + 8 - im.height);
      ctx.drawImage(im, tx - im.width + 2, railY + 8 - im.height);
      // a soft light pool from the train
      ctx.fillStyle = "rgba(255,230,160,.08)"; ctx.fillRect(tx - im.width, railY - im.height - 12, im.width * 2 + 30, im.height + 20);
    }
    // caption
    ctx.fillStyle = "rgba(251,247,236,.95)";
    ctx.fillRect(8, 8, w - 16, 34);
    ctx.fillStyle = leg.color || "#d8342c";
    ctx.fillRect(8, 8, 6, 34);
    ctx.fillStyle = "#221c28";
    ctx.font = "bold 10px monospace";
    ctx.fillText(leg.title || "", 20, 22);
    ctx.font = "9px monospace";
    ctx.fillText(leg.caption || "", 20, 35);
  }

  // ---------- update ----------
  let frameNo = 0;
  function update() {
    frameNo++;
    if (mode === "transit") { updateTransit(); return; }
    if (mode !== "play") return;
    if (bannerTimer > 0 && --bannerTimer === 0) bannerEl.hidden = true;
    if (exitCooldown > 0) exitCooldown--;
    if (dialogue) {
      dialogue.shown = Math.min(dialogue.text.length, dialogue.shown + 1.5);
      dlgText.textContent = dialogue.text.slice(0, Math.floor(dialogue.shown));
      dlgNext.style.visibility = dialogue.shown >= dialogue.text.length ? "visible" : "hidden";
    }
    for (const m of world.movers) m.update && m.update(m, frameNo);
    updateNpcs();
    if (flashTimer > 0) flashTimer--;
    if (player.act) {
      const a = player.act, d = ACT[a.name];
      a.t++;
      if (d && d.flashAt != null && !a.flashed && Math.floor(a.t / d.speed) >= d.flashAt) { a.flashed = true; flashTimer = 14; }
      const pressed = ["up", "down", "left", "right"].some((k) => keys.has(k));
      if (pressed && !dialogue) standUp();
      else return;
    }

    let dx = 0, dy = 0;
    if (!dialogue) {
      if (keys.has("left")) dx -= 1;
      if (keys.has("right")) dx += 1;
      if (keys.has("up")) dy -= 1;
      if (keys.has("down")) dy += 1;
    }
    player.moving = dx !== 0 || dy !== 0;
    if (player.moving) {
      if (dx !== 0 && dy === 0) player.dir = dx < 0 ? "left" : "right";
      else if (dy !== 0 && dx === 0) player.dir = dy < 0 ? "up" : "down";
      else if (!((dx < 0 && player.dir === "left") || (dx > 0 && player.dir === "right") || (dy < 0 && player.dir === "up") || (dy > 0 && player.dir === "down"))) {
        player.dir = dy < 0 ? "up" : "down";
      }
      const run = keys.has("run");
      const sp = (run ? 2.6 : 1.4) / (dx && dy ? Math.SQRT2 : 1);
      const nx = player.x + dx * sp, ny = player.y + dy * sp;
      if (!collides(nx, player.y)) player.x = nx;
      if (!collides(player.x, ny)) player.y = ny;
      player.anim += run ? 0.2 : 0.12;
      player.still = 0;
      if (exitCooldown <= 0) for (const e of world.exits) {
        if (player.x > e.x && player.x < e.x + e.w && player.y > e.y && player.y < e.y + e.h) {
          keys.clear();
          if (e.door) enter(scenes.find((s) => s.id === e.door.to), e.door.at);
          else startTransit(world.def);
          return;
        }
      }
    } else {
      player.anim = 0;
      player.still++;
    }
  }

  // ---------- draw ----------
  const cam = { x: 0, y: 0 };
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function drawShadow(cx, by, w) {
    ctx.fillStyle = "rgba(20, 16, 40, 0.24)";
    ctx.beginPath();
    ctx.ellipse(Math.round(cx + 2), Math.round(by - 1), Math.max(4, w / 2), Math.max(2, w / 6), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawSprite(im, x, y, flip) {
    if (!flip) { ctx.drawImage(im, x, y); return; }
    ctx.save(); ctx.translate(x + im.width, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore();
  }

  function draw() {
    if (mode === "transit") { drawTransit(); return; }
    if (!world) return;
    const d = world.def;
    // follow the player; a map smaller than the screen is centred instead
    cam.x = Math.round(world.W <= viewW ? (world.W - viewW) / 2 : Math.max(0, Math.min(world.W - viewW, player.x - viewW / 2)));
    cam.y = Math.round(world.H <= viewH ? (world.H - viewH) / 2 : Math.max(0, Math.min(world.H - viewH, player.y - 24 - viewH / 2)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // soft vertical sky gradient: deeper blue at the top of the world, the scene's sky colour at the horizon
    const sky = ctx.createLinearGradient(0, -cam.y, 0, -cam.y + world.H * 0.45);
    sky.addColorStop(0, d.skyTop || shade(d.sky || "#14121a", -0.18));
    sky.addColorStop(1, d.sky || "#14121a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    for (const b of world.backdrops) {
      const bx = Math.round(b.x - cam.x * (1 - b.p)), by = Math.round(b.y - cam.y);
      if (!b.repeatX) { ctx.drawImage(b.im, bx, by); continue; }
      const iw = b.im.width;
      for (let x = ((bx % iw) + iw) % iw - iw; x < viewW; x += iw - 1) ctx.drawImage(b.im, x, by);
    }
    ctx.drawImage(world.ground, cam.x + MARGIN * T, cam.y + MARGIN * T, viewW, viewH, 0, 0, viewW, viewH);
    ctx.translate(-cam.x, -cam.y);
    for (const e of world.entities) if (e.layer === "ground") drawSprite(e.im, e.x, e.y - e.h, e.flip);

    for (const e of world.entities) {
      if (e.layer === "ground") continue;
      if (e.shadow === "ellipse") drawShadow(e.x + e.w / 2, e.y, e.w * 0.8);
      else if (e.shadow === "base") { ctx.fillStyle = "rgba(20, 16, 40, 0.22)"; ctx.fillRect(e.x + 3, e.y - 2, e.w, 7); }
    }
    for (const m of world.movers) if (m.visible && m.shadow === "ellipse") drawShadow(m.x + m.im.width / 2, m.y, m.im.width * 0.8);
    for (const n of world.npcs) drawShadow(n.x, n.y, 16);
    drawShadow(player.x, player.y, 18);

    const list = [];
    for (const e of world.entities) if (e.layer !== "ground") list.push({ y: e.y + e.z, e });
    for (const m of world.movers) if (m.visible) list.push({ y: m.y + m.z, m });
    for (const n of world.npcs) list.push({ y: n.y, npc: n });
    list.push({ y: player.y, player: true });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.player) drawPlayer();
      else if (it.npc) drawNpc(it.npc);
      else if (it.m) drawSprite(it.m.im, Math.round(it.m.x), Math.round(it.m.y - it.m.im.height), it.m.flip);
      else drawSprite(it.e.im, it.e.x, it.e.y - it.e.h, it.e.flip);
    }

    drawActionFx();
    if (showInvented) drawInvented();

    // exit markers
    for (const e of world.exits) {
      if (!e.label) continue;
      const bob = Math.floor(frameNo / 20) % 2;
      ctx.fillStyle = "#221c28";
      ctx.font = "bold 9px monospace";
      const tw = ctx.measureText(e.label).width;
      const bx = Math.round(e.x + e.w / 2 - tw / 2 - 4), by = Math.round(e.y - 14 - bob);
      ctx.fillRect(bx - 1, by - 1, tw + 10, 13);
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(bx, by, tw + 8, 11);
      ctx.fillStyle = "#221c28"; ctx.fillText(e.label, bx + 4, by + 9);
    }

    const s = !dialogue && !player.act && nearbyTalk();
    if (s) {
      const bx = Math.round(player.x) - 6, by = Math.round(player.y) - FH - 8;
      ctx.fillStyle = "#221c28"; ctx.fillRect(bx - 1, by - 1, 14, 12);
      ctx.fillStyle = "#fbf7ec"; ctx.fillRect(bx, by, 12, 10);
      ctx.fillStyle = "#d8342c"; ctx.font = "bold 9px monospace"; ctx.fillText("A", bx + 3, by + 8);
    }
  }

  function updateNpcs() {
    for (const n of world.npcs) {
      if (n.still) continue;
      if (n.wait > 0) { n.wait--; n.moving = false; continue; }
      const [tx, ty] = n.path[n.i];
      const dx = tx - n.x, dy = ty - n.y, dist = Math.hypot(dx, dy);
      if (dist <= n.speed) { n.x = tx; n.y = ty; n.i = (n.i + 1) % n.path.length; n.wait = n.pause; n.moving = false; continue; }
      const nx = n.x + (dx / dist) * n.speed, ny = n.y + (dy / dist) * n.speed;
      // step aside for nobody: just wait while the player is in the way
      if (Math.abs(nx - player.x) < 12 && Math.abs(ny - player.y) < 7) { n.moving = false; continue; }
      n.x = nx; n.y = ny; n.moving = true; n.anim += 0.1;
      n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    }
  }
  function drawNpc(n) {
    const row = DIR_ROW[n.still ? n.face : n.dir], col = n.moving ? [1, 0, 1, 2][Math.floor(n.anim) % 4] : 1;
    ctx.drawImage(n.sheet, col * FW, row * FH, FW, FH, Math.round(n.x - FW / 2), Math.round(n.y - FH + 1), FW, FH);
  }
  function drawActionFx() {
    const a = player.act;
    if (!a) return;
    const I = world.img;
    if (a.fx && I[a.fx] && a.fxAt) {
      for (let k = 0; k < 2; k++) {
        const rise = (a.t * 0.35 + k * 10) % 20;
        ctx.globalAlpha = 1 - rise / 20;
        ctx.drawImage(I[a.fx], Math.round(a.fxAt.x - I[a.fx].width / 2 + (k ? 3 : -3)), Math.round(a.fxAt.y - I[a.fx].height - rise));
      }
      ctx.globalAlpha = 1;
    }
    if (a.name === "eat" && I.fx_heart && a.t > 80 && a.t % 200 < 110) ctx.drawImage(I.fx_heart, Math.round(player.x + 4), Math.round(player.y - FH - 10));
    if (a.name === "sit" && I.fx_sparkle && a.t < 40) ctx.drawImage(I.fx_sparkle, Math.round(player.x + 8), Math.round(player.y - FH + 2 - a.t / 4));
    if (a.name === "photo" && flashTimer > 0 && I.fx_flash) ctx.drawImage(I.fx_flash, Math.round(player.x - I.fx_flash.width / 2), Math.round(player.y - FH - 8));
  }

  function drawPlayer() {
    let col, row;
    const a = player.act, d = a && ACT[a.name];
    if (a && d && world.img.actions) {
      const k = Math.floor(a.t / d.speed), seq = d.seq;
      const idx = d.loop ? seq[k % seq.length] : seq[Math.min(k, seq.length - 1)];
      const bob = d.bob && k >= seq.length ? Math.floor(a.t / 24) % 2 : 0;
      ctx.drawImage(world.img.actions, idx * FW, d.row * FH, FW, FH, Math.round(player.x - FW / 2), Math.round(player.y - FH + 1 + bob), FW, FH);
      return;
    }
    if (!player.moving && player.still > 120 && !dialogue) { row = 4; col = 0; }
    else { row = DIR_ROW[player.dir]; col = player.moving ? [1, 0, 1, 2][Math.floor(player.anim) % 4] : 1; }
    ctx.drawImage(world.img.shawn, col * FW, row * FH, FW, FH, Math.round(player.x - FW / 2), Math.round(player.y - FH + 1), FW, FH);
  }

  function drawInvented() {
    ctx.strokeStyle = "#2f7cff";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(47, 124, 255, 0.10)";
    for (const r of world.invented) { ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
    for (const e of world.entities) if (e.invented) ctx.strokeRect(e.x + 0.5, e.y - e.h + 0.5, e.w - 1, e.h - 1);
    for (const m of world.movers) if (m.invented && m.visible) ctx.strokeRect(Math.round(m.x) + 0.5, Math.round(m.y - m.im.height) + 0.5, m.im.width - 1, m.im.height - 1);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const b of world.backdrops) if (b.invented) ctx.strokeRect(Math.round(b.x - cam.x * (1 - b.p)) + 0.5, Math.round(b.y - cam.y) + 0.5, b.im.width - 1, b.im.height - 1);
    ctx.restore();
  }

  function frame() { update(); draw(); requestAnimationFrame(frame); }

  // ---------- boot ----------
  window.addEventListener("load", async () => {
    renderPicker();
    resize();
    const q = new URLSearchParams(location.search);
    const want = scenes.find((s) => s.id === q.get("scene"));
    if (q.has("invented")) toggleInvented();
    if (want && q.has("autostart")) {
      const at = q.has("x") ? { x: +q.get("x"), y: +q.get("y"), dir: q.get("dir") || "up" } : null;
      await enter(want, at);
      // scripted test walk: ?walk=up:60,right:30,a  (direction:frames, "a" = press A, "wait:n" = idle)
      for (const stepSpec of (q.get("walk") || "").split(",").filter(Boolean)) {
        const [k, n] = stepSpec.split(":");
        if (k === "a") { pressA(); for (let i = 0; i < 200; i++) update(); continue; }
        if (k !== "wait") keys.add(k);
        for (let i = 0; i < (+n || 1); i++) update();
        keys.delete(k);
      }
    } else showPicker();
    // test hook: step(n) advances the loop by hand (rAF is paused in hidden tabs)
    DQ.test = { player, keys, pressA, toggleInvented, enter, get world() { return world; }, get mode() { return mode; },
      step(n = 1) { for (let i = 0; i < n; i++) update(); draw(); } };
    requestAnimationFrame(frame);
  });
})();
