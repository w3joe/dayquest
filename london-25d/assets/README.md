# London 2.5D scene assets

Game-ready pixel art for the three day scenes (Westminster, Kanada-Ya with its interior, Regent's Park) and the shared sprites, generated with Codex `image_gen` in the same style as `shadwell-25d`, then processed (magenta keyed, cropped, downscaled to the pixel grid, palette-limited).

## Folders

| folder | contents |
|---|---|
| `shared/` | player sheet `shawn.png` (3x4 walk + thumbs-up row, 32x48 cells; the demo persona is Lucas), `actions.png` (eat, drink, sit, photo, wave, point; 4x6 cells of 32x48), `fx_*.png`, `bus.png`, `tube_train.png`, `nelson.png`, `national_gallery.png`, `skyline.png` / `skyline_far.png` (repeating backdrop), `terrace_strip.png` (repeating street infill), `tube_tunnel.png`, phone box, bench, and the Shadwell tiles and props |
| `npcs/` | 8 generic pedestrian walk sheets `npc_*.png` (3x4 cells of 32x48: down, left, right, up), `black_cab.png`, `delivery_bike.png` |
| `westminster/` | Palace, Elizabeth Tower, Portcullis House, London Eye, Boudica, statue, pier, catamaran, the Shard, river, embankment and bridge tiles |
| `kanada-ya/` | street: Kanada-Ya shopfront, Centre Point, St Giles church, The Angel, guitar shop, tube entrance, queue, ramen bowl and icon; interior: wood floor, brick wall, kitchen, tables, chairs, table 30, four bowls + icons, cups, condiment pot, friend, diners |
| `regents-park/` | Jubilee Gates, Triton Fountain, bandstand, willow, swan, rowing boat, deckchair, noticeboard, gravel, roses, lake water and bank tiles |

Each scene folder has `reference.md` (sources and layout notes) and `prompts.md` (every image_gen prompt, verbatim).

## Scale

1 tile = 32px. The player is 46px tall in a 32x48 cell. A two-storey shop is ~150px tall; landmarks are stylised taller. Tiles are 32px (some textures are 64px or 160px and cover several cells).

## Style prefix (on every prompt)

> Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo.
