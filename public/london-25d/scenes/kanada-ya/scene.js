// Kanada-Ya, 64 St Giles High Street (scene 2 of the day), plus its interior (door-only scene).
// Camera stands on the north pavement looking south: left → right is east → west,
// so Kanada-Ya, The Angel, St Giles-in-the-Fields, Denmark Street, with Centre Point towering at the west end.
// Sources for every fact: scenes/kanada-ya/reference.md
(() => {
  const T = DQ.T;
  // street rows
  const ROW_BASE = 12;            // south-side frontages stand on this line
  const ROW_KERB_TOP = 15, ROW_KERB_BOTTOM = 18;
  const COLS = 32, ROWS = 22;
  const BASE = ROW_BASE * T;

  const TEXT = {
    meal: "Had tonkotsu ramen at Kanada-Ya.\nOrdered: tonkotsu ramen + gyoza.",
    shop: "KANADA-YA, 64 St Giles High Street.\nTonkotsu ramen from Yukuhashi, Fukuoka, where Kanada Kazuhiro opened the first shop in 2009. This was the first London branch, opened in 2014 with just 24 seats.",
    broth: "Menu card: \"Hand pulled noodles in 18 hour bone broth.\"\nNo bookings here, so there's usually a queue.",
    blade: "A little hanging sign by the corner of New Compton Street: 金田家 · KANADA-YA.",
    queue: "The lunchtime queue. Kanada-Ya doesn't take bookings, so everyone waits their turn.",
    angel: "THE ANGEL, 61-62 St Giles High Street. A Samuel Smith's pub. Prisoners on the way to the Tyburn gallows were once offered a last drink in St Giles: the \"St Giles Bowl\".",
    church: "ST GILES-IN-THE-FIELDS\nBuilt 1731-33 by Henry Flitcroft, Grade I listed. Its spire was modelled on St Martin-in-the-Fields. Known as the Poets' Church; Andrew Marvell is buried here.",
    churchyard: "The churchyard: barely an acre, behind low railings.",
    phone: "A red phone box against the churchyard railings.",
    riffs: "RIFFS — guitars in the window. (Made-up shop.)\nDenmark Street is London's 'Tin Pan Alley': the Rolling Stones recorded \"Not Fade Away\" at Regent Sound, No. 4, and the Sex Pistols lived above No. 6.",
    centre: "CENTRE POINT\n117 m, 34 floors, by R. Seifert and Partners (1963-66). Its developer kept it empty until 1975; the homeless charity Centrepoint was named in protest. Flats since 2018.",
    tube: "TOTTENHAM COURT ROAD\nCentral line west to Oxford Circus, then the Bakerloo line to Regent's Park.",
    cycle: "Sheffield cycle stands, all taken.",
    store: "No. 63 is a little convenience store. (The BEN'S BITS sign is made up.)",
  };

  DQ.scene({
    id: "kanada-ya",
    order: 2,
    time: "12:40",
    title: "Ramen lunch",
    card: "12:40 · KANADA-YA",
    cols: COLS,
    rows: ROWS,
    walkTop: BASE - 10,
    sky: "#a9d8f2",
    spawn: { x: 150, y: (ROWS - 1) * T - 8, dir: "up" },
    own: ["kanadaya", "centre_point", "church", "angel_pub", "guitar_shop", "ramen_bowl", "ramen_icon", "table", "tube_entrance", "queue"],
    assets: ["tile_paving", "tile_asphalt", "tile_kerb",
      "kanadaya", "centre_point", "church", "angel_pub", "guitar_shop", "ramen_bowl", "ramen_icon", "table", "tube_entrance", "queue",
      "shop_corner", "phone_box", "lamp", "bollard", "cycle_stand", "tree", "hedge", "bus", "bin_grey", "npc_tourist", "npc_commuter", "npc_jogger", "npc_parent", "npc_elder", "npc_dogwalker", "npc_student", "npc_busker", "black_cab", "delivery_bike"],
    transit: [
      { mode: "tube", line: "Central", color: "#E32017", title: "CENTRAL LINE", caption: "Tottenham Court Road → Oxford Circus", frames: 200 },
      { mode: "tube", line: "Bakerloo", color: "#B36305", title: "CHANGE AT OXFORD CIRCUS · BAKERLOO LINE", caption: "Oxford Circus → Regent's Park", frames: 200 },
    ],

    ground(c, r) {
      if (r < ROW_BASE) return null;
      if (r === ROW_KERB_TOP) return "tile_kerb";
      if (r > ROW_KERB_TOP && r < ROW_KERB_BOTTOM) return "tile_asphalt";
      if (r === ROW_KERB_BOTTOM) return { tile: "tile_kerb", flipY: true };
      return "tile_paving";
    },

    build(w) {
      // rooftops of the streets behind the south-side frontages (generic, invented)
      w.skyline(BASE + 4, { parallax: 0.12, invented: true });
      const { img, W } = w;
      const front = (name, x, o = {}) => w.add(name, x, BASE, { depth: 30, shadow: "base", foot: [0, img[name].width], ...o });

      // Centre Point towers over the west end, drawn behind the Denmark Street shop
      const cp = w.add("centre_point", 800, BASE - 2, { depth: 20, shadow: "none", foot: [0, img.centre_point.width] });
      w.talk(cp.x + cp.w / 2, BASE + 4, TEXT.centre);

      // Kanada-Ya on the corner of New Compton Street (the gap at the far left is New Compton Street)
      const ky = front("kanadaya", 64);
      w.talk(ky.x + ky.w * 0.62, BASE, TEXT.shop);
      w.talk(ky.x + ky.w * 0.12, BASE, TEXT.blade);
      // the door: walk in to enter the restaurant
      const doorX = Math.round(ky.x + ky.w * 0.62);
      w.door(doorX - 12, BASE + 2, 24, 10, { to: "kanada-ya-inside", at: { x: 384, y: 16 * T - 30, dir: "up" }, label: "IN" });
      // outdoor table with the tonkotsu bowl (spec; the real pavement has wooden benches)
      const tb = w.add("table", ky.x + ky.w + 4, BASE + 40, { depth: 12, invented: true });
      const bowlBase = tb.y - tb.h + img.ramen_bowl.height + 4;
      w.add("ramen_bowl", tb.x + Math.round((tb.w - img.ramen_bowl.width) / 2) - 2, bowlBase, { solid: false, shadow: "none", z: tb.y - bowlBase + 1 });
      w.talk(tb.x + tb.w / 2, tb.y, TEXT.meal, { icon: "ramen_icon" });
      w.add("queue", ky.x - 40, BASE + 30, { depth: 10, invented: true, talk: TEXT.queue });
      w.talk(ky.x + ky.w * 0.85, BASE + 2, TEXT.broth);

      // No. 63 is a convenience store: shared corner-shop sprite, sign invented
      const cs63 = front("shop_corner", ky.x + ky.w + 60, { invented: true });
      w.talk(cs63.x + cs63.w / 2, BASE, TEXT.store);
      // The Angel pub next door
      const angel = front("angel_pub", cs63.x + cs63.w + 4);
      w.talk(angel.x + angel.w / 2, BASE, TEXT.angel);

      // phone box by the churchyard railings, then the church set back in its churchyard
      const pb = w.add("phone_box", angel.x + angel.w + 8, BASE + 14, { depth: 12, talk: TEXT.phone });
      const ch = front("church", pb.x + pb.w + 30, { depth: 24 });
      w.talk(ch.x + ch.w * 0.5, BASE + 30, TEXT.church);
      for (let hx = ch.x + 6; hx < ch.x + ch.w - 40; hx += img.hedge.width + 4) w.add("hedge", hx, BASE + 20, { depth: 12 });
      w.talk(ch.x + ch.w * 0.25, BASE + 22, TEXT.churchyard);
      w.add("tree", ch.x + ch.w - 50, BASE + 26, { foot: [img.tree.width / 2 - 6, 12], depth: 8 });

      // Denmark Street corner: invented guitar shop
      const gs = front("guitar_shop", ch.x + ch.w + 44, { invented: true });
      w.talk(gs.x + gs.w / 2, BASE, TEXT.riffs);

      // street furniture
      for (let lx = 30; lx < W; lx += 256) w.add("lamp", lx, ROW_KERB_TOP * T - 4, { foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
      for (let lx = 150; lx < W; lx += 256) w.add("lamp", lx, (ROW_KERB_BOTTOM + 1) * T + 6, { foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
      for (let i = 0; i < 4; i++) w.add("bollard", 40 + i * 26, (ROW_KERB_BOTTOM + 1) * T + 20, {});
      const cs = [];
      for (let i = 0; i < 4; i++) cs.push(w.add("cycle_stand", 420 + i * 34, (ROW_KERB_BOTTOM + 2) * T + 4, {}));
      w.talk(cs[1].x + cs[1].w, cs[1].y, TEXT.cycle);
      w.add("bin_grey", 620, (ROW_KERB_BOTTOM + 1) * T + 18, {});

      // Tottenham Court Road entrance on the north pavement, west end (towards St Giles Circus)
      const te = w.add("tube_entrance", 860, ROWS * T - 2, { solid: false, shadow: "none", layer: "ground" }); // stairs go down: drawn under the player
      w.block(te.x + 4, te.y - te.h + 30, te.w - 8, 10);           // back railing
      w.talk(te.x - 10, te.y - 40, TEXT.tube);
      w.exit(te.x + 22, te.y - 50, 44, 30, { label: "TUBE" });

      // passers-by and traffic (generic people, invented)
      const southY = BASE + 62, northY = (ROW_KERB_BOTTOM + 1) * T + 34;
      w.npc("npc_commuter", { path: [[70, northY], [W - 70, northY]], speed: 0.7, talk: "A commuter hurries past: \"Lunch hour. Half of Soho is in that ramen queue.\"" });
      w.npc("npc_student", { path: [[W - 140, northY + 18], [180, northY + 18]], speed: 0.5, delay: 90 });
      w.npc("npc_tourist", { path: [[W - 60, southY], [260, southY]], speed: 0.45, pause: 90, talk: "A tourist with a map: \"Is this the way to Denmark Street? The guitar shops?\"" });
      w.npc("npc_busker", { path: [[W - 210, southY + 6]], still: true, face: "down", talk: "A busker tunes a guitar. Denmark Street, round the corner, was London's Tin Pan Alley." });
      w.traffic("black_cab", { y: (ROW_KERB_TOP + 1) * T + 24, speed: 1.5, gap: 240 });
      w.traffic("delivery_bike", { y: (ROW_KERB_TOP + 2) * T + 18, speed: -1.1, flip: true, gap: 360, offset: 400 });

      // buses use the street (route numbers on the shared sprite aren't this street's)
      w.mover("bus", { x: -260, y: (ROW_KERB_TOP + 2) * T + 22, invented: true, update(m) {
        if (m.wait > 0) { m.wait--; m.visible = false; return; }
        m.visible = true;
        m.x += 1.6;
        if (m.x > W + 40) { m.x = -260; m.wait = 600; }
      } });
    },
  });

  // ---------------- inside ----------------
  const IC = 24, IR = 16;
  const KB = 8 * T;               // kitchen counter base line
  const IN = {
    tonkotsu: "TONKOTSU (ORIGINAL) RAMEN\nCreamy 18-hour pork bone broth, a big slice of chashu belly, a jammy hanjuku egg and swirls of black garlic oil. This is the one.",
    shoyu: "A lighter bowl: clear golden broth, thin straight noodles, chashu and half an egg. Clean and salty.",
    spicy: "The spicy one: red broth piled with crispy karaage chicken, blistered shishito peppers and thin slices of beef. Bring tissues.",
    rich: "A deep brown broth with mushrooms, a pile of minced pork, a marinated egg, spring onion and crunchy fried bits on top.",
    cups: "Table 30. Two steel tumblers of cold water, refilled twice already.",
    pot: "A little steel pot with a lid. Inside: pickled ginger? Chilli? Lift it and see.",
    friend: "\"Ramen for four and there's only two of us. No regrets.\"",
    kitchen: "The open kitchen: big pots of pork-bone broth simmering for 18 hours, and a fresh tray of noodles. \"Irasshaimase!\"",
    diners: "Two other diners, slurping loudly. That's good manners here.",
    door: "Back out to St Giles High Street.",
  };

  DQ.scene({
    id: "kanada-ya-inside",
    dir: "kanada-ya",
    hidden: true,
    title: "Kanada-Ya — inside",
    card: "KANADA-YA · INSIDE",
    cols: IC,
    rows: IR,
    walkTop: KB - 8,
    sky: "#2a1a14",
    spawn: { x: 384, y: IR * T - 30, dir: "up" },
    own: ["tile_wood", "tile_wall", "kitchen", "dining_table", "table30", "chair", "steel_cups", "condiment_pot",
      "bowl_tonkotsu", "bowl_shoyu", "bowl_spicy", "bowl_rich", "ramen_icon", "icon_shoyu", "icon_spicy", "icon_rich", "friend", "diners", "long_table"],
    assets: ["tile_wood", "tile_wall", "kitchen", "dining_table", "table30", "chair", "steel_cups", "condiment_pot",
      "bowl_tonkotsu", "bowl_shoyu", "bowl_spicy", "bowl_rich", "ramen_icon", "icon_shoyu", "icon_spicy", "icon_rich", "friend", "diners", "long_table"],

    ground(c, r) {
      if (r < 5) return { tile: "tile_wall", solid: true };
      return "tile_wood";
    },

    build(w) {
      const { img, W, H } = w;
      // brick back wall with the open kitchen counter in front of it (layout inferred)
      w.invented(0, 0, W, 5 * T);
      const k = w.add("kitchen", Math.round((W - img.kitchen.width) / 2), KB, { depth: 30, shadow: "base", invented: true, foot: [0, img.kitchen.width] });
      w.talk(k.x + k.w / 2, k.y + 4, IN.kitchen);

      // other tables (invented layout and diners)
      const others = [[40, 11 * T], [40, 14 * T + 8], [W - 40 - img.dining_table.width, 14 * T + 8]];
      for (const [x, y] of others) w.add("dining_table", x, y, { depth: 24, invented: true });
      // two other diners on the far side of a long table (its top hides their laps)
      const lx = W - 24 - img.long_table.width, ly = 11 * T + 4;
      const d = w.add("diners", lx + Math.round((img.long_table.width - img.diners.width) / 2), ly - img.long_table.height + 14, { depth: 6, invented: true, shadow: "none" });
      w.add("long_table", lx, ly, { depth: 26, invented: true, foot: [4, img.long_table.width - 8] });
      w.talk(d.x + d.w / 2, ly + 2, IN.diners);

      // the player's table 30, from the meal photo
      const tx = Math.round((W - img.table30.width) / 2), ty = 12 * T + 8;
      const fr = w.add("friend", Math.round(W / 2 - img.friend.width / 2), ty - img.table30.height + 14, { depth: 8, z: -1 });
      const t30 = w.add("table30", tx, ty, { depth: 28, foot: [4, img.table30.width - 8] });
      w.talk(fr.x + fr.w / 2, fr.y, IN.friend, { action: "wave" });   // talk to the friend from behind their chair; Lucas waves
      for (const cx of [tx - img.chair.width + 2, tx + t30.w - 2]) w.add("chair", cx, ty - 6, { depth: 6, foot: [2, img.chair.width - 4] });
      // things on the table (z keeps them drawn above the table top)
      const top = ty - t30.h;              // top edge of the table sprite
      // Lucas's seat: far side of the table at the right end, facing the camera; the table hides his legs
      const seat = { x: tx + t30.w - 16, y: top + 16, dir: "down" };
      const put = (name, x, y, text, icon, action) => {
        const base = top + y + img[name].height;
        const e = w.add(name, tx + x, base, { solid: false, shadow: "none", z: ty - base + 1 + y / 100 });
        const fx = action === "eat" ? { fx: "fx_steam", fxAt: { x: e.x + e.w / 2, y: e.y - e.h + 2 } } : {};
        w.talk(e.x + e.w / 2, ty + 4, text, { ...(icon ? { icon } : {}), ...(action ? { action, seat, ...fx } : {}) });
        return e;
      };
      put("steel_cups", 6, 8, IN.cups, null, "drink");
      put("bowl_shoyu", Math.round(t30.w * 0.30), 6, IN.shoyu, "icon_shoyu", "eat");
      put("bowl_tonkotsu", Math.round(t30.w * 0.62), 6, IN.tonkotsu, "ramen_icon", "eat");
      put("bowl_spicy", Math.round(t30.w * 0.16), 22, IN.spicy, "icon_spicy", "eat");
      put("bowl_rich", Math.round(t30.w * 0.48), 24, IN.rich, "icon_rich", "eat");
      put("condiment_pot", t30.w - 16, 24, IN.pot);

      // the shop door back to the street, just below Kanada-Ya's door
      w.door(W / 2 - 24, H - 14, 48, 12, { to: "kanada-ya", at: { x: 129, y: BASE + 26, dir: "down" }, label: "OUT" });
    },
  });
})();
