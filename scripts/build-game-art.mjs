import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// Deterministic, local-only derivation from the processed Shadwell artwork.
const source = "shadwell-25d/assets";
const target = "public/tiles/dq/library";
await mkdir(target, { recursive: true });
const names = ["tile_grass", "tile_flowers", "tile_paving", "tile_brick"];
const tiles = await Promise.all(names.map(name => sharp(`${source}/${name}.png`).resize(16, 16, { kernel: "nearest" }).png().toBuffer()));
tiles.push(await sharp("public/tiles/dq/water.png").resize(16, 16, { kernel: "nearest" }).png().toBuffer());
tiles.push(await sharp(`${source}/hedge.png`).resize(16, 16, { fit: "cover", kernel: "nearest" }).png().toBuffer());
await sharp({ create: { width: tiles.length * 16, height: 16, channels: 4, background: "#00000000" } })
  .composite(tiles.map((input, i) => ({ input, left: i * 16, top: 0 }))).png().toFile("public/tiles/dq-atlas.png");
await sharp(`${source}/tree.png`).resize({ height: 48, kernel: "nearest" }).png().toFile("public/tiles/dq/tree.png");
const ground = { grass: "tile_grass", flowers: "tile_flowers", pavement: "tile_paving", cobble: "tile_brick", road: "tile_asphalt", kerb: "tile_kerb" };
await Promise.all(Object.entries(ground).map(([name, input]) => sharp(`${source}/${input}.png`).resize(16, 16, { kernel: "nearest" }).png().toFile(`${target}/${name}.png`)));
const props = { tree: 60, lamp: 58, bollard: 20, cycle_stand: 28, aboard: 28, hedge: 20, bin_grey: 26, bin_purple: 26, car_red: 34, car_blue: 34 };
await Promise.all(Object.entries(props).map(([name, height]) => sharp(`${source}/${name}.png`).resize({ height, kernel: "nearest" }).png().toFile(`${target}/${name}.png`)));
console.log("Game textures and street furniture built from Shadwell's processed artwork.");
await import("./build-transport-art.mjs");
