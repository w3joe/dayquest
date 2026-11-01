// Shadwell Overground station street (the original prototype), ported to the shared engine.
// Bonus scene: not part of the day's chain (no `order`), reachable from the scene picker.
(() => {
  const T = DQ.T;
  const ROW_STATION_BASE = 8, ROW_KERB_TOP = 12, ROW_KERB_BOTTOM = 15, ROW_FAR_START = 16, ROW_GRASS = 18, ROW_SHOPS_BASE = 26;
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

  DQ.scene({
    id: "shadwell",
    title: "Shadwell — from two photos",
    card: "SHADWELL",
    cols: 56,
    rows: 29,
    walkTop: (ROW_STATION_BASE - 1) * T,
    sky: "#14121a",
    spawn: { x: 300, y: 312, dir: "down" },
    own: [],
    assets: ["tile_paving", "tile_brick", "tile_asphalt", "tile_kerb", "tile_grass", "tile_flowers",
      "station", "flats", "yellow_house", "shop_corner", "shop_cafe", "shop_laundry", "viaduct", "train",
      "lamp", "bollard", "cycle_stand", "aboard", "tree", "hedge", "bin_grey", "bin_purple", "car_red", "car_blue"],

    ground(c, r) {
      if (r < ROW_STATION_BASE) return "tile_brick";
      if (r === ROW_KERB_TOP) return "tile_kerb";
      if (r > ROW_KERB_TOP && r < ROW_KERB_BOTTOM) return "tile_asphalt";
      if (r === ROW_KERB_BOTTOM) return { tile: "tile_kerb", flipY: true };
      if (r >= ROW_GRASS && r < ROW_GRASS + 3) {
        return r <= ROW_GRASS + 1 && c % 9 >= 3 && c % 9 <= 5 ? "tile_flowers" : "tile_grass";
      }
      if (r >= ROW_GRASS + 3) return "tile_brick";
      return "tile_paving";
    },

    build(w) {
      const { img, W, H } = w;
      const stationBase = ROW_STATION_BASE * T;
      const via = img.viaduct;
      const viaBase = stationBase - 40;
      for (let x = 400; x < W; x += via.width) w.add("viaduct", x, viaBase, { invented: true, shadow: "none", solid: false });
      // the train runs along the viaduct, sorted just in front of it
      const ty = viaBase - via.height + Math.round(via.height * 0.06);
      w.mover("train", { x: 760, y: ty, z: viaBase - ty + 0.5, invented: true, update(m) {
        if (m.wait > 0) { m.wait--; return; }
        m.x -= 2.2;
        if (m.x < 300 - m.im.width) { m.x = W + 40; m.wait = 420; }
      } });

      const st = w.add("station", 72, stationBase, { depth: 40, shadow: "base", foot: [0, img.station.width] });
      w.talk(st.x + st.w * 0.29, st.y, TEXT.noEntry);
      w.talk(st.x + st.w * 0.10, st.y, TEXT.letters);
      w.talk(st.x + st.w * 0.77, st.y, TEXT.posters);
      w.talk(st.x + st.w * 0.97, st.y, TEXT.roundel);
      w.talk(st.x + st.w * 0.89, st.y, TEXT.noParking);
      w.talk(st.x + st.w * 0.60, st.y, TEXT.cctv);

      let x = st.x + st.w + 150;
      const flats = w.add("flats", x, stationBase, { depth: 40, shadow: "base", talk: TEXT.flats });
      x += flats.w + 24;
      w.add("bin_grey", x - 20, stationBase + 6, {});
      w.add("bin_purple", x - 4 - img.bin_purple.width - 20, stationBase + 6, {});
      const house = w.add("yellow_house", x, stationBase, { depth: 40, shadow: "base", talk: TEXT.house });
      x += house.w + 40;
      w.add("tree", x, stationBase + 10, { foot: [img.tree.width / 2 - 6, 12], depth: 8 });

      w.add("aboard", st.x + st.w * 0.36, stationBase + 34, { talk: TEXT.aboard });
      for (let i = 0; i < 4; i++) w.add("bollard", st.x + st.w * 0.18 + i * 22, stationBase + 64, {});
      for (let i = 0; i < 3; i++) w.add("cycle_stand", st.x + st.w + 8 + i * 30, stationBase + 40, {});
      for (let lx = 40; lx < W; lx += 224) w.add("lamp", lx, ROW_KERB_TOP * T - 6, { foot: [img.lamp.width / 2 - 4, 8], depth: 6 });

      w.add("car_red", 760, (ROW_KERB_TOP + 1) * T + 26, { depth: 18 });
      w.add("car_blue", 1260, ROW_KERB_BOTTOM * T + 4, { invented: true, depth: 18 });

      // far side of the road: all generated
      w.invented(0, ROW_FAR_START * T, W, H - ROW_FAR_START * T);
      const shopBase = ROW_SHOPS_BASE * T;
      const shops = [["shop_corner", TEXT.corner], ["shop_cafe", TEXT.cafe], ["shop_laundry", TEXT.laundry]];
      let sx = 24, k = 0;
      while (sx < W - 100) {
        const [name, text] = shops[k % 3];
        const s = w.add(name, sx, shopBase, { invented: true, depth: Math.round(img[name].height * 0.6), shadow: "base", foot: [0, img[name].width] });
        w.talk(s.x + s.w / 2, s.y + 6, text);
        sx += s.w;
        k++;
        if (k % 3 === 0) sx += 64;
      }
      for (let tx = 120; tx < W; tx += 260) w.add("tree", tx, ROW_GRASS * T + 50, { invented: true, foot: [img.tree.width / 2 - 6, 12], depth: 8 });
      for (let hx = 210; hx < W - 80; hx += 260) w.add("hedge", hx, (ROW_GRASS + 3) * T - 6, { invented: true, depth: 14 });
      for (let lx = 200; lx < W; lx += 260) w.add("lamp", lx, (ROW_FAR_START + 1) * T + 4, { invented: true, foot: [img.lamp.width / 2 - 4, 8], depth: 6 });
    },
  });
})();
