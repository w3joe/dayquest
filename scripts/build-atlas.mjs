// Packs the generated 16x16 ground tiles into one row for the tilemap. Order must match FRAMES in game/maps.ts.
import sharp from "sharp";

const ORDER = ["grass", "grass_flowers", "path", "cobble", "water", "hedge"];
const tiles = await Promise.all(ORDER.map((n) => sharp(`public/tiles/dq/${n}.png`).ensureAlpha().toBuffer()));
await sharp({ create: { width: 16 * ORDER.length, height: 16, channels: 4, background: "#00000000" } })
  .composite(tiles.map((input, i) => ({ input, left: i * 16, top: 0 }))).png().toFile("public/tiles/dq-atlas.png");
console.log("atlas:", ORDER.join(", "));
