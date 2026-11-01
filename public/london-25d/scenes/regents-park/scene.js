// Regent's Park, 14:15–15:30: in through the Jubilee Gates, up the central walk of Queen Mary's Gardens
// to the Triton Fountain, then west to Holme Green and the boating lake. Last scene of the day.
// Real layout and facts: scenes/regents-park/reference.md. The lake is pulled in beside the gardens.
(() => {
  const T = DQ.T;
  const COLS = 40, ROWS = 30;
  // lake: water in cols 0..LAKE_C-1, rows 0..LAKE_R-1; bank on col LAKE_C and row LAKE_R
  const LAKE_C = 11, LAKE_R = 17;
  // central walk (gravel) and the fountain circle at its north end
  const WALK_C0 = 23, WALK_C1 = 26, WALK_R0 = 8;
  const PLAZA = { c0: 20, c1: 29, r0: 2, r1: 8 };
  // east-west path: from the lake bank past the bandstand, across the walk and off the east edge (exit)
  const PATH_R0 = 17, PATH_R1 = 18;
  const FENCE_R = 29; // the gates and the hedge line sit on this row's ground line; outside is the Inner Circle pavement
  const BEDS = [ // rose beds [c0, r0, c1, r1] inclusive, either side of the walk
    [18, 10, 21, 15], [28, 10, 31, 15],
    [18, 20, 21, 25], [28, 20, 31, 25],
  ];
  const inBed = (c, r) => BEDS.some(([c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1);

  const TEXT = {
    gates: "I came in through the Jubilee Gates at 14:15. They mark George V's Silver Jubilee and the opening of Queen Mary's Gardens on 6 May 1935, a gift from the painter Sigismund Goetze. Black iron, partly gilded, with the King's cipher. Grade II listed.",
    roses: "Rose beds line the central walk. There are 85 of them in Queen Mary's Gardens, each planted with a single variety. The rose garden was first planted in 1932 and finished in 1934.",
    roses2: "Most of the roses had been cut back for November, but a few late flowers were still out.",
    fountain: "At 14:50 I reached the Triton Fountain at the end of the central walk. A bronze triton blowing a conch, with two mermaids at his feet, by William McMillan. It was designed in 1936 but only put up in 1950, given by Goetze's widow in his memory.",
    bandstand: "The bandstand on Holme Green, between the boating lake and the Inner Circle. It was moved here from Richmond Park in the 1970s. A small plaque on its base remembers seven army bandsmen killed by an IRA bomb during a concert here on 20 July 1982.",
    lake: "I got to the boating lake at 15:20. On 15 January 1867 the ice broke under about 200 skaters and 40 people died. Afterwards the lake was drained, its bed levelled with concrete and the depth cut to four feet.",
    swans: "Swans, geese and ducks on the water. Herons nest on the lake's islands.",
    boats: "Rowing boats and pedalos are hired out here from spring until October.",
    bench: "I sat on a bench by the walk for a few minutes before carrying on.",
    deckchairs: "Green and white striped deckchairs on the lawn.",
    stats: "MY WALK\n14:15 – 15:30, Regent's Park.\nI walked 3.8 km in 75 minutes: 5,200 steps from the Jubilee Gates to the boating lake.",
  };

  DQ.scene({
    id: "regents-park",
    order: 3,
    time: "14:15",
    title: "Walk in Regent's Park",
    card: "14:15 · REGENT'S PARK",
    cols: COLS,
    rows: ROWS,
    sky: "#2a9d5c",
    spawn: { x: (WALK_C0 + 2) * T, y: FENCE_R * T - 80, dir: "up" }, // just inside the gates
    own: ["jubilee_gates", "triton", "bandstand", "swan", "rowing_boat", "willow", "deckchair", "noticeboard",
      "tile_lake_edge", "tile_lake_edge_v", "tile_lake_corner", "tile_water", "tile_gravel", "tile_roses"],
    assets: ["tile_grass", "tile_paving", "tile_gravel", "tile_roses", "tile_water", "tile_lake_edge", "tile_lake_edge_v", "tile_lake_corner",
      "jubilee_gates", "triton", "bandstand", "swan", "rowing_boat", "willow", "deckchair", "noticeboard",
      "tree", "hedge", "bench", "lamp", "bin_grey"],

    ground(c, r) {
      if (c < LAKE_C && r < LAKE_R) return { tile: "tile_water", solid: true };
      if (c === LAKE_C && r < LAKE_R) return { tile: "tile_lake_edge_v", solid: true };
      if (c < LAKE_C && r === LAKE_R) return { tile: "tile_lake_edge", solid: true };
      if (c === LAKE_C && r === LAKE_R) return { tile: "tile_lake_corner", solid: true };
      if (r >= FENCE_R) return "tile_paving";
      if (c >= WALK_C0 && c <= WALK_C1 && r >= WALK_R0) return "tile_gravel";
      if (c >= PLAZA.c0 && c <= PLAZA.c1 && r >= PLAZA.r0 && r <= PLAZA.r1) return "tile_gravel";
      if (r >= PATH_R0 && r <= PATH_R1 && c > LAKE_C) return "tile_gravel";
      if (inBed(c, r)) return { tile: "tile_roses", solid: true };
      return "tile_grass";
    },

    build(w) {
      const { img, W, H } = w;
      const midX = (WALK_C0 + 2) * T; // centre line of the walk
      const fenceY = FENCE_R * T + 18;

      // ---- Jubilee Gates (bottom centre): Shawn starts just inside them, facing up the walk ----
      const g = img.jubilee_gates;
      const gx = midX - g.width / 2;
      w.add("jubilee_gates", gx, fenceY, { shadow: "base", depth: g.height - 24, foot: [0, g.width] });
      w.talk(midX, fenceY - g.height + 10, TEXT.gates);
      w.talk(gx + 20, fenceY - g.height + 10, TEXT.gates);
      w.talk(gx + g.width - 20, fenceY - g.height + 10, TEXT.gates);
      // the boundary either side of the gates: a hedge line, the Inner Circle pavement beyond
      for (let x = -8; x < W; x += img.hedge.width - 2) {
        if (x + img.hedge.width > gx && x < gx + g.width) continue;
        w.add("hedge", x, fenceY, { depth: 14, foot: [0, img.hedge.width], invented: true });
      }
      // ---- Triton Fountain at the north end of the central walk ----
      const tr = img.triton;
      const fy = (PLAZA.r0 + PLAZA.r1) / 2 * T + tr.height * 0.32;
      const ft = w.add("triton", midX - tr.width / 2, fy, { depth: Math.round(tr.height * 0.42), foot: [4, tr.width - 8], shadow: "none" });
      w.talk(midX, ft.y, TEXT.fountain);
      w.talk(ft.x, ft.y - 20, TEXT.fountain);
      w.talk(ft.x + ft.w, ft.y - 20, TEXT.fountain);

      // ---- rose beds, hedges and benches along the walk ----
      for (const [c0, r0, c1, r1] of BEDS) {
        const bx = c0 * T, by = r0 * T, bw = (c1 - c0 + 1) * T, bh = (r1 - r0 + 1) * T;
        const edgeX = c0 < WALK_C0 ? bx + bw : bx;
        w.talk(edgeX, by + bh / 2, r0 < 18 ? TEXT.roses : TEXT.roses2);
        w.talk(bx + bw / 2, by + bh, r0 < 18 ? TEXT.roses : TEXT.roses2);
        // a low beech hedge along the north edge of each bed (the borders are "framed by beech hedges")
        for (let x = bx; x < bx + bw - 8; x += img.hedge.width - 2) w.add("hedge", x, by + 2, { depth: 12, foot: [0, img.hedge.width - 2], invented: true });
      }
      // benches face the walk across the gaps between beds (the main alley is "lined with benches")
      for (const by of [(BEDS[2][1] - 2) * T + 10, (BEDS[2][3] + 2) * T - 2]) {
        w.add("bench", WALK_C0 * T - img.bench.width - 6, by, { depth: 10, talk: TEXT.bench });
        w.add("bench", (WALK_C1 + 1) * T + 6, by, { depth: 10, talk: TEXT.bench });
      }
      // and two on the fountain circle, facing the walk
      for (const x of [PLAZA.c0 * T + 44, (PLAZA.c1 + 1) * T - 44 - img.bench.width]) {
        w.add("bench", x, (PLAZA.r1 + 1) * T - 6, { depth: 10, talk: TEXT.bench });
      }
      for (const [x, y] of [[PLAZA.c0 * T + 6, (PLAZA.r1 + 1) * T - 4], [(PLAZA.c1 + 1) * T - 26, (PLAZA.r1 + 1) * T - 4]]) {
        w.add("lamp", x, y, { foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
      }

      // ---- the boating lake (west) ----
      const lakeR = LAKE_R * T, lakeC = LAKE_C * T;
      w.talk(lakeC + T + 4, 8 * T, TEXT.lake);
      w.talk(lakeC + T + 4, 13 * T, TEXT.lake);
      w.talk(5 * T, lakeR + T + 8, TEXT.lake);
      w.talk(2 * T, lakeR + T + 8, TEXT.swans);
      w.talk(lakeC + T + 4, 3 * T, TEXT.swans);
      w.invented(0, 0, lakeC + T, lakeR + T); // real lake, but its shoreline here is made up
      const swans = [[3.2 * T, 5.5 * T, 0.18], [6 * T, 11 * T, -0.14], [7.4 * T, 11.6 * T, -0.14]];
      for (const [sx, sy, v] of swans) {
        // the sprite faces left; flip = swimming right
        w.mover("swan", { x: sx, y: sy, flip: v > 0, shadow: "none", update(m, f) {
          m.x += m.flip ? Math.abs(v) : -Math.abs(v);
          if (m.x < 0.6 * T) m.flip = true;
          if (m.x > lakeC - img.swan.width - 8) m.flip = false;
          m.y = sy + Math.sin((f + sx) / 50) * 2;
        } });
      }
      const boat = img.rowing_boat;
      w.mover("rowing_boat", { x: 2 * T, y: 8.5 * T, invented: true, update(m, f) {
        m.x = 1.5 * T + (lakeC - boat.width - 3 * T) * (0.5 + 0.5 * Math.sin(f / 600));
        m.flip = Math.cos(f / 600) > 0;
        m.y = 8.5 * T + Math.sin(f / 40);
      } });
      // weeping willows on the bank
      for (const [x, y] of [[lakeC + 26, 4 * T], [lakeC + 26, 15 * T + 10], [2 * T, lakeR + 2 * T + 20], [8 * T, lakeR + 3 * T + 4]]) {
        w.add("willow", x - img.willow.width / 2, y, { foot: [img.willow.width / 2 - 8, 16], depth: 10 });
      }

      // ---- Holme Green: bandstand and deckchairs ----
      const bs = img.bandstand;
      const bsx = 15 * T - bs.width / 2, bsy = 13 * T;
      w.add("bandstand", bsx, bsy, { depth: Math.round(bs.height * 0.22), foot: [6, bs.width - 12], shadow: "base" });
      w.talk(bsx + bs.width / 2, bsy, TEXT.bandstand);
      w.talk(bsx, bsy - 12, TEXT.bandstand);
      w.talk(bsx + bs.width, bsy - 12, TEXT.bandstand);
      for (const [x, y, flip] of [[12.6 * T, 15.6 * T, false], [13.7 * T, 15.8 * T, false], [16.4 * T, 15.6 * T, true]]) {
        w.add("deckchair", x, y, { depth: 8, flip, invented: true, talk: TEXT.deckchairs });
      }

      // ---- plane trees on the lawns ----
      const trees = [[14, 4], [17, 7], [33, 4], [37, 9], [34, 14], [38, 22], [33, 25], [14, 22], [17, 25], [5, 23], [10, 25]];
      for (const [c, r] of trees) w.add("tree", c * T - img.tree.width / 2, r * T + 10, { foot: [img.tree.width / 2 - 6, 12], depth: 8 });

      // ---- exit east: noticeboard with the walk stats, then the path home ----
      const nb = w.add("noticeboard", 35 * T, PATH_R0 * T - 4, { depth: 8, invented: true });
      w.talk(nb.x + nb.w / 2, nb.y, TEXT.stats);
      w.add("bin_grey", 33 * T + 6, PATH_R0 * T - 4, { invented: true });
      w.exit(W - 28, PATH_R0 * T, 28, 2 * T, { label: "HOME" });
      w.invented(W - 3 * T, PATH_R0 * T, 3 * T, 2 * T);
    },
  });
})();
