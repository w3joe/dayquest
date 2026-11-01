// Shadwell 2.5D — vanilla canvas, y-sorted sprites, footprint collisions.
(() => {
  "use strict";

  const T = 32;
  const COLS = 56;
  const ROWS = 29;
  const WORLD_W = COLS * T;
  const WORLD_H = ROWS * T;
  const BASE_W = 480;
  const BASE_H = 320;
  // ground rows
  const ROW_STATION_BASE = 8;   // buildings sit on this line
  const ROW_KERB_TOP = 12;
  const ROW_KERB_BOTTOM = 15;
  const ROW_FAR_START = 16;     // everything from here down was invented
  const ROW_GRASS = 18;
  const ROW_SHOPS_BASE = 26; // shop fronts face a back pavement along the bottom

  const ASSETS = [
    "tile_paving", "tile_brick", "tile_asphalt", "tile_kerb", "tile_grass", "tile_flowers",
    "station", "flats", "yellow_house", "shop_corner", "shop_cafe", "shop_laundry", "viaduct", "train",
    "lamp", "bollard", "cycle_stand", "aboard", "tree", "hedge", "bin_grey", "bin_purple", "car_red", "car_blue",
    "shawn",
  ];

  const img = {};
  function load(name) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve((img[name] = i));
      i.onerror = () => reject(new Error("missing asset " + name));
      i.src = (window.ASSET_DATA && window.ASSET_DATA[name]) || `assets/${name}.png`;
    });
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let viewW = BASE_W, viewH = BASE_H, scale = 1;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    scale = Math.max(1, Math.floor(Math.min(w / BASE_W, h / BASE_H)));
    viewW = Math.min(WORLD_W, Math.ceil(w / scale));
    viewH = Math.min(WORLD_H, Math.ceil(h / scale));
    canvas.width = viewW;
    canvas.height = viewH;
    canvas.style.width = viewW * scale + "px";
    canvas.style.height = viewH * scale + "px";
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", resize);

  // ---------- world ----------
  const entities = [];
  const talkSpots = [];

  // foot: [x offset from left, height above base, width]; omitted = whole width, `depth` px deep
  function add(name, x, baseY, opts = {}) {
    const im = img[name];
    const e = {
      name, im, x: Math.round(x), y: Math.round(baseY), w: im.width, h: im.height,
      invented: !!opts.invented, shadow: opts.shadow ?? "ellipse", flip: !!opts.flip,
    };
    const depth = opts.depth ?? Math.min(12, Math.round(im.height * 0.3));
    const [fx, fw] = opts.foot ?? [Math.round(im.width * 0.1), Math.round(im.width * 0.8)];
    e.box = opts.solid === false ? null : { x: e.x + fx, y: e.y - depth, w: fw, h: depth };
    if (opts.talk) talkSpots.push({ x: e.x + e.w / 2, y: e.y, text: opts.talk });
    entities.push(e);
    return e;
  }

  function talkAt(x, y, text) { talkSpots.push({ x, y, text }); }

  const TEXT = {
    aboard: "No entry. A one-way system is operating. Please use the entrance on Cable Street.",
    noEntry: "NO ENTRY\nThis doorway is exit only while the one-way system is running.",
    roundel: "SHADWELL\nLondon Overground — trains north to Highbury & Islington, south to New Cross, Crystal Palace and West Croydon.",
    posters: "Four poster panels: a gig night in Whitechapel, a phone deal, a 'mind the gap' reminder and a lost-cat flyer.",
    noParking: "No parking. Not even for a minute.",
    cctv: "A little CCTV camera watches the forecourt. Smile!",
    letters: "Big red letters: S H A D W E L L.",
    corner: "BEN'S BITS — open till late. Milk, bread, phone top-ups.",
    cafe: "TEA TIME — flat whites, bacon rolls and a window seat.",
    laundry: "SUDS — service washes. Today's special: odd socks reunited.",
    flats: "A tall cream block of flats. Someone is watering plants on a balcony.",
    house: "A yellow-brick house with a red tiled roof.",
  };

  let train = null;

  function buildWorld() {
    const stationBase = ROW_STATION_BASE * T;
    // viaduct behind everything on the station side
    const via = img.viaduct;
    const viaBase = stationBase - 40;
    for (let x = 400; x < WORLD_W; x += via.width) add("viaduct", x, viaBase, { invented: true, shadow: "none", solid: false });
    train = { x: 760, y: viaBase - via.height + Math.round(via.height * 0.06), speed: 2.2, wait: 0 };

    // station
    const st = add("station", 72, stationBase, { depth: 40, shadow: "base", foot: [0, img.station.width] });
    // fractions measured off the generated station image
    talkAt(st.x + st.w * 0.29, st.y, TEXT.noEntry);
    talkAt(st.x + st.w * 0.10, st.y, TEXT.letters);
    talkAt(st.x + st.w * 0.77, st.y, TEXT.posters);
    talkAt(st.x + st.w * 0.97, st.y, TEXT.roundel);
    talkAt(st.x + st.w * 0.89, st.y, TEXT.noParking);
    talkAt(st.x + st.w * 0.60, st.y, TEXT.cctv);

    // flats and the yellow house further right
    let x = st.x + st.w + 150; // leave a gap so the viaduct arches show
    const flats = add("flats", x, stationBase, { depth: 40, shadow: "base", talk: TEXT.flats });
    x += flats.w + 24;
    add("bin_grey", x - 20, stationBase + 6, {});
    add("bin_purple", x - 4 - img.bin_purple.width - 20, stationBase + 6, {});
    const house = add("yellow_house", x, stationBase, { depth: 40, shadow: "base", talk: TEXT.house });
    x += house.w + 40;
    add("tree", x, stationBase + 10, { foot: [img.tree.width / 2 - 6, 12], depth: 8 });

    // station-side pavement furniture
    const aboard = add("aboard", st.x + st.w * 0.36, stationBase + 34, { talk: TEXT.aboard });
    for (let i = 0; i < 4; i++) add("bollard", st.x + st.w * 0.18 + i * 22, stationBase + 64, {});
    for (let i = 0; i < 3; i++) add("cycle_stand", st.x + st.w + 8 + i * 30, stationBase + 40, {});
    for (let lx = 40; lx < WORLD_W; lx += 224) add("lamp", lx, (ROW_KERB_TOP) * T - 6, { foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
    void aboard;

    // parked cars on the road
    add("car_red", 760, (ROW_KERB_TOP + 1) * T + 26, { depth: 18 }); // station side: in the photo
    add("car_blue", 1260, (ROW_KERB_BOTTOM) * T + 4, { invented: true, depth: 18 }); // far side: invented

    // far side (generated): grass verge, trees, hedges, terraced shops
    const shopBase = ROW_SHOPS_BASE * T;
    const shops = [["shop_corner", TEXT.corner], ["shop_cafe", TEXT.cafe], ["shop_laundry", TEXT.laundry]];
    let sx = 24, k = 0;
    while (sx < WORLD_W - 100) {
      const [name, text] = shops[k % 3];
      // deep footprint so you can't walk "inside" a terrace; gaps between terraces lead round the front
      const s = add(name, sx, shopBase, { invented: true, depth: Math.round(img[name].height * 0.6), shadow: "base", foot: [0, img[name].width] });
      talkAt(s.x + s.w / 2, s.y + 6, text);
      sx += s.w;
      k++;
      if (k % 3 === 0) sx += 64;
    }
    for (let tx = 120; tx < WORLD_W; tx += 260) {
      add("tree", tx, ROW_GRASS * T + 50, { invented: true, foot: [img.tree.width / 2 - 6, 12], depth: 8 });
    }
    for (let hx = 210; hx < WORLD_W - 80; hx += 260) add("hedge", hx, (ROW_GRASS + 3) * T - 6, { invented: true, depth: 14 });
    for (let lx = 200; lx < WORLD_W; lx += 260) add("lamp", lx, (ROW_FAR_START + 1) * T + 4, { invented: true, foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
  }

  // ---------- ground ----------
  let groundCanvas = null;
  function flowerAt(c, r) { return r >= ROW_GRASS && r <= ROW_GRASS + 1 && c % 9 >= 3 && c % 9 <= 5; }
  function buildGround() {
    groundCanvas = document.createElement("canvas");
    groundCanvas.width = WORLD_W;
    groundCanvas.height = WORLD_H;
    const g = groundCanvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * T, y = r * T;
        let tile = "tile_paving";
        if (r < ROW_STATION_BASE) tile = "tile_brick";
        else if (r === ROW_KERB_TOP) tile = "tile_kerb";
        else if (r > ROW_KERB_TOP && r < ROW_KERB_BOTTOM) tile = "tile_asphalt";
        else if (r === ROW_KERB_BOTTOM) {
          g.save();
          g.translate(x, y + T);
          g.scale(1, -1);
          g.drawImage(img.tile_kerb, 0, 0);
          g.restore();
          continue;
        } else if (r >= ROW_GRASS && r < ROW_GRASS + 3) tile = flowerAt(c, r) ? "tile_flowers" : "tile_grass";
        else if (r >= ROW_GRASS + 3) tile = "tile_brick";
        const im = img[tile];
        // big textures cover 2x2 cells; draw the matching quarter
        if (im.width > T) g.drawImage(im, (c % 2) * T, (r % 2) * T, T, T, x, y, T, T);
        else g.drawImage(im, x, y);
      }
    }
  }

  // ---------- player ----------
  const FW = 32, FH = 48;
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const player = { x: 300, y: 312, dir: "down", anim: 0, still: 0, moving: false };
  const HIT = { w: 14, h: 6 };

  function collides(px, py) {
    const l = px - HIT.w / 2, r = px + HIT.w / 2, t = py - HIT.h, b = py;
    if (l < 4 || r > WORLD_W - 4 || t < (ROW_STATION_BASE - 1) * T || b > WORLD_H - 4) return true;
    for (const e of entities) {
      const k = e.box;
      if (k && r > k.x && l < k.x + k.w && b > k.y && t < k.y + k.h) return true;
    }
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

  // ---------- title, dialogue, invented toggle ----------
  const titleEl = document.getElementById("title");
  let started = false;
  function start() { if (!started) { started = true; titleEl.hidden = true; } }
  titleEl.addEventListener("pointerdown", start);

  const dlg = document.getElementById("dialogue");
  const dlgText = document.getElementById("dialogue-text");
  const dlgNext = document.getElementById("dialogue-next");
  let dialogue = null; // { text, shown }

  function nearbyTalk() {
    const ahead = { up: [0, -14], down: [0, 14], left: [-14, -4], right: [14, -4] }[player.dir];
    const fx = player.x + ahead[0], fy = player.y + ahead[1];
    let best = null, bestD = 30;
    for (const s of talkSpots) {
      const d = Math.hypot(s.x - fx, (s.y - fy) * 1.4);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  function pressA() {
    if (!started) { start(); return; }
    if (dialogue) {
      if (dialogue.shown < dialogue.text.length) dialogue.shown = dialogue.text.length;
      else { dialogue = null; dlg.hidden = true; }
      return;
    }
    const s = nearbyTalk();
    if (s) { dialogue = { text: s.text, shown: 0 }; dlg.hidden = false; player.still = 0; }
  }

  let showInvented = false;
  const invBtn = document.getElementById("toggle-invented");
  const legend = document.getElementById("legend");
  function toggleInvented() {
    showInvented = !showInvented;
    invBtn.setAttribute("aria-pressed", String(showInvented));
    invBtn.textContent = "Invented: " + (showInvented ? "on" : "off");
    legend.hidden = !showInvented;
  }
  invBtn.addEventListener("click", (ev) => { ev.stopPropagation(); toggleInvented(); invBtn.blur(); });

  // ---------- update ----------
  function update() {
    if (dialogue) {
      dialogue.shown = Math.min(dialogue.text.length, dialogue.shown + 1.5);
      dlgText.textContent = dialogue.text.slice(0, Math.floor(dialogue.shown));
      dlgNext.style.visibility = dialogue.shown >= dialogue.text.length ? "visible" : "hidden";
    }

    if (train.wait > 0) train.wait--;
    else {
      train.x -= train.speed;
      if (train.x < 300 - img.train.width) { train.x = WORLD_W + 40; train.wait = 420; }
    }

    let dx = 0, dy = 0;
    if (started && !dialogue) {
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
    } else {
      player.anim = 0;
      player.still++;
    }
  }

  // ---------- draw ----------
  const cam = { x: 0, y: 0 };
  function drawShadow(cx, by, w) {
    ctx.fillStyle = "rgba(20, 16, 40, 0.24)";
    ctx.beginPath();
    ctx.ellipse(Math.round(cx + 2), Math.round(by - 1), Math.max(4, w / 2), Math.max(2, w / 6), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    cam.x = Math.round(Math.max(0, Math.min(WORLD_W - viewW, player.x - viewW / 2)));
    cam.y = Math.round(Math.max(0, Math.min(WORLD_H - viewH, player.y - 24 - viewH / 2)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#14121a";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.drawImage(groundCanvas, cam.x, cam.y, viewW, viewH, 0, 0, viewW, viewH);
    ctx.translate(-cam.x, -cam.y);

    // shadows first so nothing is drawn on top of a sprite
    for (const e of entities) {
      if (e.shadow === "ellipse") drawShadow(e.x + e.w / 2, e.y, e.w * 0.8);
      else if (e.shadow === "base") {
        ctx.fillStyle = "rgba(20, 16, 40, 0.22)";
        ctx.fillRect(e.x + 3, e.y - 2, e.w, 7);
      }
    }
    drawShadow(player.x, player.y, 18);

    const list = entities.map((e) => ({ y: e.y, e }));
    list.push({ y: player.y, player: true });
    list.push({ y: (ROW_STATION_BASE * T - 40) + 0.5, train: true });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      if (it.player) drawPlayer();
      else if (it.train) {
        if (train.x < WORLD_W) ctx.drawImage(img.train, Math.round(train.x), train.y - img.train.height);
      } else ctx.drawImage(it.e.im, it.e.x, it.e.y - it.e.h);
    }

    if (showInvented) drawInvented();

    const s = !dialogue && started && nearbyTalk();
    if (s) {
      // little "A" bubble over Shawn's head
      const bx = Math.round(player.x) - 6, by = Math.round(player.y) - FH - 8;
      ctx.fillStyle = "#221c28";
      ctx.fillRect(bx - 1, by - 1, 14, 12);
      ctx.fillStyle = "#fbf7ec";
      ctx.fillRect(bx, by, 12, 10);
      ctx.fillStyle = "#d8342c";
      ctx.font = "bold 9px monospace";
      ctx.fillText("A", bx + 3, by + 8);
    }
  }

  function drawPlayer() {
    let col, row;
    if (!player.moving && player.still > 120 && !dialogue) { row = 4; col = 0; }
    else {
      row = DIR_ROW[player.dir];
      col = player.moving ? [1, 0, 1, 2][Math.floor(player.anim) % 4] : 1;
    }
    ctx.drawImage(img.shawn, col * FW, row * FH, FW, FH, Math.round(player.x - FW / 2), Math.round(player.y - FH + 1), FW, FH);
  }

  function drawInvented() {
    ctx.strokeStyle = "#2f7cff";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(47, 124, 255, 0.10)";
    const fy = ROW_FAR_START * T;
    ctx.fillRect(0, fy, WORLD_W, WORLD_H - fy);
    ctx.strokeRect(1.5, fy + 0.5, WORLD_W - 3, WORLD_H - fy - 2);
    for (const e of entities) if (e.invented) ctx.strokeRect(e.x + 0.5, e.y - e.h + 0.5, e.w - 1, e.h - 1);
    if (train.x < WORLD_W) ctx.strokeRect(Math.round(train.x) + 0.5, train.y - img.train.height + 0.5, img.train.width - 1, img.train.height - 1);
  }

  function frame() {
    update();
    draw();
    requestAnimationFrame(frame);
  }

  Promise.all(ASSETS.map(load)).then(() => {
    resize();
    buildGround();
    buildWorld();
    // URL options for screenshots and sharing: ?autostart&x=..&y=..&invented
    const q = new URLSearchParams(location.search);
    if (q.has("autostart")) start();
    if (q.has("x")) player.x = +q.get("x");
    if (q.has("y")) player.y = +q.get("y");
    if (q.has("invented")) toggleInvented();
    // test hook: step(n) advances the loop by hand (rAF is paused in hidden tabs)
    const step = (n = 1) => { for (let i = 0; i < n; i++) update(); draw(); };
    window.__shadwell = { player, entities, talkSpots, keys, start, pressA, toggleInvented, step };
    requestAnimationFrame(frame);
  }).catch((err) => {
    document.body.insertAdjacentHTML("beforeend", `<pre style="color:#fff;position:fixed;top:0;left:0">${err.message}</pre>`);
  });
})();
