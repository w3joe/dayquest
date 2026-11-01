// Westminster: the South Bank (Queen's Walk) looking west over the Thames to the Palace of Westminster.
// Up = west. The player starts by the London Eye, crosses Westminster Bridge and leaves on the 24 bus.
// Layout and facts: scenes/westminster/reference.md.
(() => {
  const T = DQ.T;
  const COLS = 60, ROWS = 41;
  const ROW_TOP = 9;            // first ground row on the far bank (above it: sky)
  const ROW_SQ0 = 10, ROW_SQ1 = 13;   // Parliament Square lawn rows (west of the Palace = above it)
  const ROW_SM = 15;            // St Margaret Street: kerb 15, asphalt 16, kerb 17, between the Square and the Palace
  const ROW_FAR_KERB = 21;      // Victoria Embankment road: kerb row, then asphalt
  const ROW_FAR_ROAD = 22;      // two asphalt rows (22, 23)
  const ROW_FAR_KERB2 = 24;
  const ROW_FAR_EDGE = 26;      // far river wall
  const ROW_NEAR_EDGE = 32;     // near river wall (water rows are 27..31)
  const BRIDGE_C = 30, BRIDGE_W = 5;   // bridge columns 30..34; Bridge Street: pavement 30, road 31..33, pavement 34
  const BX0 = BRIDGE_C * T, BX1 = (BRIDGE_C + BRIDGE_W) * T;
  const onBridge = (c) => c >= BRIDGE_C && c < BRIDGE_C + BRIDGE_W;
  const SQ_C0 = 12, SQ_C1 = 26;       // Parliament Square lawn columns

  const TEXT = {
    bigBen: "Took a photo of Big Ben from the end of the bridge.\nThe tower has been called Elizabeth Tower since 2012; Big Ben is really the 13.7-tonne bell inside. It is 96 m tall and was finished in 1859.",
    bridge: "Walked Westminster Bridge. It opened on 24 May 1862, designed by Thomas Page with Gothic details by Charles Barry.\nIt's painted green like the benches in the House of Commons. Lambeth Bridge, upriver, is red like the Lords.",
    eye: "Rode the London Eye. One slow turn takes about 30 minutes, 135 m up at the top, in one of 32 glass capsules.\nIt opened to the public in March 2000. Got a photo of the view from the top.",
    square: "Parliament Square, laid out in 1868 by Charles Barry, with the Palace on one side and the Supreme Court and Westminster Abbey on the others.\nIts statues include Winston Churchill (Ivor Roberts-Jones, 1973), facing Parliament, and Millicent Fawcett (2018), the first statue of a woman here.",
    churchill: "Winston Churchill in his greatcoat, by Ivor Roberts-Jones, unveiled in 1973. He faces the Houses of Parliament.",
    tube: "Westminster station: the Jubilee, District and Circle lines.\nIt opened in 1868 on the District Railway; the deep Jubilee line platforms opened in 1999, built together with Portcullis House above them.",
    palace: "Looked across the river at the Palace of Westminster. Charles Barry and Augustus Pugin rebuilt it after the fire of 16 October 1834.\nIt has over 1,100 rooms. The Union Flag flies from the Victoria Tower.",
    boudica: "Boudica and her daughters in a scythed chariot, by Thomas Thornycroft.\nThe bronze was put up here in 1902, at the end of the bridge, facing Parliament.",
    portcullis: "Portcullis House: offices for MPs, opened in 2001.\nThe tall bronze chimneys aren't for fires. They're part of its natural ventilation.",
    pier: "Westminster Pier, opened in 2000. River boats leave from here for Tower Bridge and Greenwich.",
    busStop: "Bus stop for the 24 to Hampstead Heath, via Whitehall, Trafalgar Square and Tottenham Court Road.\nThe route has run since 1910.",
    phone: "A red phone box. Tourists queue to take photos in it.",
    walk: "The Queen's Walk: the riverside path along the South Bank, from Lambeth Bridge to Tower Bridge.",
  };

  DQ.scene({
    id: "westminster",
    order: 1,
    time: "10:00",
    title: "Touring Westminster",
    card: "10:30 · WESTMINSTER",
    cols: COLS,
    rows: ROWS,
    walkTop: ROW_TOP * T + 4,
    sky: "#a9d4f5",
    spawn: { x: BX0 + 80, y: ROWS * T - 14, dir: "up" },
    own: ["palace", "big_ben", "portcullis", "london_eye", "boudica", "bus_stop", "catamaran", "pier", "shard", "statue", "tube_entrance",
      "tile_water", "tile_embankment", "tile_embankment_near", "tile_bridge", "tile_kerb_l", "tile_kerb_r"],
    assets: ["palace", "big_ben", "portcullis", "london_eye", "boudica", "bus_stop", "catamaran", "pier", "shard", "statue", "tube_entrance",
      "tile_water", "tile_embankment", "tile_embankment_near", "tile_bridge", "tile_kerb_l", "tile_kerb_r",
      "tile_paving", "tile_asphalt", "tile_kerb", "tile_grass", "tile_flowers",
      "tree", "hedge", "bench", "lamp", "bollard", "phone_box", "bin_grey", "bus", "npc_tourist", "npc_student", "npc_commuter", "npc_jogger", "npc_elder", "black_cab", "delivery_bike"],
    transit: [{ mode: "bus", route: "24", destination: "Hampstead Heath", title: "BUS 24 → HAMPSTEAD HEATH",
      caption: "Parliament Square → Tottenham Court Road · via Whitehall & Trafalgar Square", color: "#d8342c", frames: 260 }],

    ground(c, r) {
      if (r < ROW_TOP) return null;
      const bridge = { tile: "tile_bridge", ox: BRIDGE_C };
      if (r >= ROW_FAR_EDGE && r <= ROW_NEAR_EDGE) {
        if (onBridge(c)) return bridge;
        if (r === ROW_FAR_EDGE) return "tile_embankment";
        if (r === ROW_NEAR_EDGE) return "tile_embankment_near";
        return { tile: "tile_water", solid: true };
      }
      if (r < ROW_FAR_EDGE) {
        // far bank: Bridge Street runs straight up (west) from the bridge; Victoria Embankment runs off to the right
        const embRow = r >= ROW_FAR_KERB && r <= ROW_FAR_KERB2;
        const smRow = r >= ROW_SM && r <= ROW_SM + 2;
        if (smRow && c <= BRIDGE_C + 1) return c > BRIDGE_C ? "tile_asphalt" : r === ROW_SM ? "tile_kerb" : r === ROW_SM + 2 ? { tile: "tile_kerb", flipY: true } : "tile_asphalt";
        if (c === BRIDGE_C + 1) return "tile_kerb_l";
        if (c === BRIDGE_C + 2) return "tile_asphalt";
        if (c === BRIDGE_C + 3) return embRow ? "tile_asphalt" : "tile_kerb_r";
        if (c > BRIDGE_C + 3 && embRow) {
          if (r === ROW_FAR_KERB) return "tile_kerb";
          if (r === ROW_FAR_KERB2) return { tile: "tile_kerb", flipY: true };
          return "tile_asphalt";
        }
        // Parliament Square: lawn with a cross of paths, west of (above) the Palace
        if (r >= ROW_SQ0 && r <= ROW_SQ1 && c >= SQ_C0 && c <= SQ_C1) {
          if (r === ROW_SQ0 + 2 || c === SQ_C0 + 7) return "tile_paving";
          return "tile_grass";
        }
        return "tile_paving";
      }
      // near bank: Queen's Walk, with the lawns of Jubilee Gardens at the bottom right
      if (r >= ROWS - 3 && c >= 40) return (c + r) % 7 < 2 && r === ROWS - 2 ? "tile_flowers" : "tile_grass";
      return "tile_paving";
    },

    build(w) {
      const { img, W } = w;
      const farEdgeY = ROW_FAR_EDGE * T, nearEdgeY = ROW_NEAR_EDGE * T;
      const tree = (x, y, o = {}) => w.add("tree", x - img.tree.width / 2, y, { foot: [img.tree.width / 2 - 6, 12], depth: 8, ...o });
      const lamp = (x, y, o = {}) => w.add("lamp", x - img.lamp.width / 2, y, { foot: [img.lamp.width / 2 - 4, 8], depth: 6, ...o });

      // ---- skyline: the Shard is really behind the viewer here (it's east, in Southwark); the spec puts it on the skyline
      w.backdrop("shard", 850, ROW_TOP * T - img.shard.height + 6, { parallax: 0.3, invented: true });
      // city rooftops beyond the far bank, so the landmarks stand in front of a street, not bare sky (generic, invented)
      w.skyline(ROW_TOP * T + 4, { parallax: 0.12, invented: true });

      // ---- river walls: the water half of each edge tile is not walkable
      w.block(0, farEdgeY + 19, BX0, T - 19);
      w.block(BX1, farEdgeY + 19, W - BX1, T - 19);
      w.block(0, nearEdgeY, BX0, 15);
      w.block(BX1, nearEdgeY, W - BX1, 15);
      // bridge parapets (green cast iron)
      w.block(BX0, farEdgeY, 9, (ROW_NEAR_EDGE + 1 - ROW_FAR_EDGE) * T);
      w.block(BX1 - 9, farEdgeY, 9, (ROW_NEAR_EDGE + 1 - ROW_FAR_EDGE) * T);
      w.talk(BX0 + 10, (ROW_FAR_EDGE + 3) * T, TEXT.bridge);
      w.talk(BX1 - 10, (ROW_FAR_EDGE + 4) * T, TEXT.bridge);
      for (const y of [farEdgeY + 2, (ROW_NEAR_EDGE + 1) * T - 2]) {
        lamp(BX0 + 4, y, { shadow: "none" });
        lamp(BX1 - 4, y, { shadow: "none" });
      }

      // ---- far bank, left: the Palace's river front runs south (left) from Elizabeth Tower at the bridge foot,
      // on its riverside terrace (row ROW_FAR_EDGE - 1) behind the stone river wall; the terrace is not public
      const bb = img.big_ben;
      const bbX = BX0 - bb.width;           // the tower's right side meets Bridge Street's pavement
      const towerBase = farEdgeY - 2;
      const palaceBase = farEdgeY - 10;     // a little behind the tower so the tower draws in front
      w.add("palace", bbX - img.palace.width + 18, palaceBase, { solid: false, shadow: "base" });
      w.add("big_ben", bbX, towerBase, { solid: false, shadow: "base" });
      const palaceTop = palaceBase - 170;   // footprint: front face, Westminster Hall and New Palace Yard behind it
      w.block(0, palaceTop, BX0 - 2, farEdgeY + 19 - palaceTop);
      w.talk(BX0 + 4, towerBase - 40, TEXT.bigBen, { action: "photo" });   // "took a photo of Big Ben": photo pose + flash

      // ---- Parliament Square, west of the Palace (above it here), with the skyline behind
      const sqX0 = SQ_C0 * T, sqX1 = (SQ_C1 + 1) * T, sqY0 = ROW_SQ0 * T, sqY1 = (ROW_SQ1 + 1) * T;
      w.talk((sqX0 + sqX1) / 2, sqY1 + 4, TEXT.square);
      // Churchill stands on the east side, facing Parliament; the second plinth stands in for the other statues
      w.add("statue", sqX0 + 15 * T - 14, sqY1 - 4, { depth: 10, foot: [2, 25], talk: TEXT.churchill });
      w.add("statue", sqX0 + 4 * T - 14, sqY1 - 4, { depth: 10, foot: [2, 25], flip: true, invented: true });
      tree(sqX0 + 40, sqY0 + 30, { invented: true });
      for (let x = sqX0 + 60; x < sqX1; x += 180) lamp(x, sqY1 + 22, { invented: true });

      // ---- far bank, right: Boudica on the bridge corner, the Embankment, Portcullis House, the bus stop
      const bo = img.boudica;
      w.add("boudica", BX1 + 4, farEdgeY + 2, { depth: 20, shadow: "base", talk: TEXT.boudica, foot: [0, bo.width] });
      // Portcullis House across Bridge Street from the tower, on the corner with the Embankment
      const pcX = BX1 + 96;
      const pc = w.add("portcullis", pcX, ROW_FAR_KERB * T - 4, { depth: 60, shadow: "base", foot: [0, img.portcullis.width] });
      w.talk(pc.x + pc.w / 2, pc.y + 2, TEXT.portcullis);
      // Westminster station entrance on the Bridge Street pavement beside it (stairs go down: drawn under the player)
      const te = img.tube_entrance;
      w.add("tube_entrance", BX1 + 4, ROW_FAR_KERB * T - 2, { solid: false, shadow: "none", layer: "ground", talk: TEXT.tube });
      w.invented(BX1 + 4, ROW_FAR_KERB * T - 2 - te.height, te.width, te.height);
      for (let x = pc.x + pc.w + 60; x < W; x += 230) tree(x, ROW_FAR_KERB * T - 6);
      for (let x = BX1 + 60; x < W; x += 200) tree(x, ROW_TOP * T + 150, { invented: true });
      w.add("bus", BX1 + 200, (ROW_FAR_ROAD + 2) * T - 4, { depth: 22, foot: [6, img.bus.width - 12] });
      for (let x = BX1 + 150; x < W; x += 210) tree(x, farEdgeY - 2);
      for (let x = BX1 + 110; x < W; x += 210) lamp(x, farEdgeY + 4);
      // the pier floats below the wall, with a catamaran shuttling in and out
      const pr = img.pier;
      w.add("pier", BX1 + 60, farEdgeY + 30 + pr.height, { solid: false, shadow: "none" });
      w.talk(BX1 + 60 + pr.width / 2, farEdgeY + 16, TEXT.pier);
      const dockX = BX1 + 60 + pr.width + 6, boatY = farEdgeY + 34 + pr.height + 20;
      w.mover("catamaran", { x: dockX, y: boatY, invented: true, update(m) {
        // dock, sail right out of view, come back
        m.t = (m.t || 0) + 1;
        const cycle = 1500, t = m.t % cycle;
        if (t < 300) { m.x = dockX; m.flip = false; }
        else if (t < 900) { m.x = dockX + (t - 300) * 1.4; m.flip = true; }
        else { m.x = dockX + (1500 - t) * 1.4; m.flip = false; }
        m.visible = m.x < W;
      } });

      // Bridge Street leads up to Parliament Square: the bus stop is at the top
      const stopX = BX1 - 26;
      w.add("bus_stop", stopX, ROW_TOP * T + 26, { depth: 6, foot: [img.bus_stop.width / 2 - 3, 6], talk: TEXT.busStop, invented: true });
      w.exit(BX0 + 40, ROW_TOP * T + 4, BX1 - BX0 - 80, 14, { label: "BUS 24" });

      // crowds on the bridge and the Queen's Walk, traffic on the Embankment (generic people, invented)
      const qy = (ROW_NEAR_EDGE + 5) * T + 20;
      w.npc("npc_tourist", { path: [[BX0 + 30, (ROW_NEAR_EDGE + 1) * T - 8], [BX0 + 30, (ROW_FAR_EDGE + 1) * T + 8]], speed: 0.45, pause: 80,
        talk: "A tourist, phone out: \"Can you get Big Ben and the Eye in one shot from here? Almost!\"" });
      w.npc("npc_student", { path: [[BX1 - 30, (ROW_FAR_EDGE + 1) * T + 8], [BX1 - 30, (ROW_NEAR_EDGE + 1) * T - 8]], speed: 0.6, delay: 150 });
      w.npc("npc_commuter", { path: [[2 * T, qy], [BX0 - 2 * T, qy]], speed: 0.7 });
      w.npc("npc_jogger", { path: [[BX1 + 2 * T, qy + 34], [(COLS - 2) * T, qy + 34]], speed: 1.2,
        talk: "A jogger on the Queen's Walk: \"Best run in London. River the whole way.\"" });
      w.npc("npc_elder", { path: [[6 * T, qy + 50], [12 * T, qy + 50]], speed: 0.25, pause: 160 });
      w.traffic("black_cab", { y: ROW_FAR_ROAD * T + 26, speed: 1.5, gap: 260 });
      w.traffic("delivery_bike", { y: (ROW_FAR_ROAD + 1) * T + 20, speed: -1.1, flip: true, gap: 420, offset: 500 });
      w.add("phone_box", BX1 - 6, ROW_TOP * T + 74, { depth: 12, talk: TEXT.phone, invented: true });
      for (const bx of [BX0 + 12, BX1 - 22]) w.add("bollard", bx, ROW_FAR_EDGE * T - 2, { invented: true });
      // trees along the top edge (towards Parliament Square and Whitehall Gardens)
      for (let x = 30; x < W; x += 120) if (x < BX0 - 40 || x > BX1 + 200) tree(x, ROW_TOP * T + 12, { solid: false, invented: true });
      for (let x = 0; x < W; x += 64) if (x + 66 < BX0 - 30 || x > BX1 + 200) w.add("hedge", x, ROW_TOP * T + 6, { solid: false, shadow: "none", invented: true });

      // ---- near bank: Queen's Walk
      const walkY = (ROW_NEAR_EDGE + 1) * T;
      for (let x = 70; x < W; x += 190) if (x < BX0 - 40 || x > BX1 + 40) lamp(x, walkY + 4);
      for (let x = 150; x < BX0 - 60; x += 190) {
        tree(x, walkY + 96);
        w.add("bench", x + 40, walkY + 60, { depth: 10, invented: true });
      }
      w.talk(420, walkY + 2, TEXT.palace);
      w.talk(260, walkY + 2, TEXT.walk);
      w.add("bin_grey", BX0 - 40, walkY + 64, { invented: true });
      w.add("phone_box", BX0 - 70, walkY + 120, { depth: 12, talk: TEXT.phone, invented: true });

      // the London Eye, on the river side of the Walk, to the right of the bridge
      const eye = img.london_eye;
      const eyeX = BX1 + 150;
      const e = w.add("london_eye", eyeX, walkY + 84, { depth: 30, foot: [Math.round(eye.width * 0.06), Math.round(eye.width * 0.36)], shadow: "none" });
      w.talk(e.x + Math.round(e.w * 0.24), e.y + 2, TEXT.eye);
      for (let x = eyeX + eye.width + 60; x < W - 40; x += 170) {
        tree(x, walkY + 110);
        w.add("bench", x + 40, walkY + 66, { depth: 10, invented: true });
      }
      for (let x = BX1 + 40; x < W; x += 230) tree(x, ROWS * T - 6, { invented: true });
    },
  });
})();
