# Image prompts

All images were generated with Codex's built-in `image_gen` tool (Codex CLI 0.166 from Codex.app, signed in with ChatGPT — no API key), one call per asset, via `tools/gen.sh`. Raw outputs are in `raw/`.

Every prompt starts with the same style prefix:

> Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo.

Sprites add the object suffix:

> Show ONE isolated object, centred, whole object visible with margin around it, on a perfectly flat solid pure magenta (#FF00FF) background. No cast shadow on the ground, no ground plane, no scenery, no border, no extra text or labels.

Tiles add the tile suffix:

> This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.

## Per-asset prompts

- **tile_paving**: ONLY plain sandy beige square concrete paving slabs: exactly 2x2 equal square slabs separated by thin slightly darker grout lines, flat colour with a few tiny specks. Nothing else: no grass, no plants, no bricks, no borders. *(+ tile suffix)*
- **tile_brick**: Warm red-brown brick paving laid in a herringbone pattern, thin light mortar. *(+ tile suffix)*
- **tile_asphalt**: ONLY plain dark blue-grey asphalt road surface: one flat colour with a few tiny lighter specks scattered evenly. Nothing else: no road markings, no grass, no kerbs, no paving, no crossroads. *(+ tile suffix)*
- **tile_kerb**: Road edge tile: top quarter is a light grey stone kerb strip running horizontally, below it dark blue-grey asphalt with two parallel bright yellow lines running horizontally close to the kerb (UK double yellow lines). Tiles seamlessly left-right. *(+ tile suffix)*
- **tile_grass**: ONLY uniform bright teal-green lawn grass: one flat green base colour with a few small darker green grass tufts (little v-shaped blades) scattered evenly. Nothing else: no paths, no stones, no bricks, no dirt, no sand patches. *(+ tile suffix)*
- **tile_flowers**: ONLY a dense flower bed texture: small round pixel flowers in yellow, cream and pink with green leaves packed evenly over dark soil, covering the whole tile uniformly. Nothing else: no paths, no paving, no borders, no edging, no planters. *(+ tile suffix)*
- **station**: A large London railway station front building, wide landscape composition 1536x1024. Left part: a dark chocolate-brown brick two-storey block. Across its upper wall, big chunky red 3D block letters spelling exactly SHADWELL. Below the letters, a flat grey cantilevered concrete canopy sticking out over the entrance, with 4 round warm yellow downlights on its underside. Under the canopy a wide open entrance showing a bright tiled ticket hall inside with a row of grey ticket gates. A small white rectangular sign reading NO ENTRY hangs above the entrance. Right part: a lower one-storey brick wing with a 4-panel poster board on its wall, a small round blue no-parking sign, a little CCTV camera on a bracket, a small red box at the base of the wall, and a round sign on a bracket sticking out from the wall: a red ring with a blue horizontal bar across it reading OVERGROUND in white. *(+ object suffix)*
- **flats**: A cream-coloured 5-storey modern block of flats, rectangular, with rows of windows and small balconies with metal railings, flat roof, a glass entrance door at ground level. Portrait composition 1024x1536. *(+ object suffix)*
- **yellow_house**: A London yellow stock brick 3-storey house with a red clay tiled pitched roof, white sash windows, a black front door with a fanlight. Square 1024x1024. *(+ object suffix)*
- **shop_corner**: A London Victorian terraced house, 2 storeys, red brick upper floor with two sash windows, ground floor corner shop front with green fascia sign reading BEN'S BITS, a window full of goods and a striped awning. Portrait 1024x1536. *(+ object suffix)*
- **shop_cafe**: A London Victorian terraced house, 2 storeys, pale painted stucco upper floor with two sash windows, ground floor cafe shopfront with a cream and teal fascia reading TEA TIME, big window with little tables and a coffee cup decal. Portrait 1024x1536. *(+ object suffix)*
- **shop_laundry**: A London Victorian terraced house, 2 storeys, brown brick upper floor with two sash windows, ground floor launderette shopfront with a blue fascia reading SUDS, a window showing a row of round washing machines. Portrait 1024x1536. *(+ object suffix)*
- **viaduct**: A long straight Victorian red-brick railway viaduct seen from the side and slightly above: a row of 4 tall round brick arches with a flat parapet on top and dark railway track along the top. Wide landscape 1536x1024, viaduct spans the full width. *(+ object suffix)*
- **train**: A short modern commuter train, 2 carriages, seen from the side and slightly above: white body with an orange stripe along the bottom and orange doors, dark windows, grey roof. Very wide landscape 1536x1024, train spans almost full width. *(+ object suffix)*
- **lamp**: A black Victorian heritage street lamp post with a lantern head glowing warm yellow. Tall and thin, portrait 1024x1536. *(+ object suffix)*
- **bollard**: A short black cast-iron street bollard with a rounded top and a thin gold band. Square 1024x1024. *(+ object suffix)*
- **cycle_stand**: A black steel Sheffield-style bike stand (inverted U hoop) with two yellow reflective bands. Square 1024x1024. *(+ object suffix)*
- **aboard**: A white folding A-frame pavement sign with a red border reading NO ENTRY in bold black letters. Square 1024x1024. *(+ object suffix)*
- **tree**: A round leafy street tree with a bushy bright green crown and a short brown trunk. Square 1024x1024. *(+ object suffix)*
- **hedge**: A low rectangular trimmed green hedge block, long and short, seen from slightly above. Landscape 1536x1024. *(+ object suffix)*
- **bin_grey**: A grey plastic wheelie bin with a lid and two wheels. Square 1024x1024. *(+ object suffix)*
- **bin_purple**: A purple plastic wheelie bin with a lid and two wheels. Square 1024x1024. *(+ object suffix)*
- **car_red**: A small cute red hatchback car seen from the side and slightly above, facing right. Landscape 1536x1024. *(+ object suffix)*
- **car_blue**: A small cute sky-blue compact car seen from the side and slightly above, facing left. Landscape 1536x1024. *(+ object suffix)*
- **shawn_walk**: Character sprite sheet for a chibi player character called Shawn (big head, small body, about 2.5 heads tall). He is a young East Asian man with short dark hair and a full fringe, round dark-rimmed glasses and a big grin. He wears a glossy red puffer jacket worn open over a light grey T-shirt, a purple lanyard with a white badge covered in coloured dots, wide-leg mid-blue jeans and dark grey trainers. Layout: a strict grid of 4 rows x 3 columns, every cell the same size, characters evenly spaced and not touching. Row 1: walking DOWN toward the viewer (frames: left foot forward, standing, right foot forward). Row 2: walking LEFT (3 frames). Row 3: walking RIGHT (3 frames). Row 4: walking UP away from the viewer, back view (3 frames). Same character, same size and same colours in every frame. Square 1024x1024. Flat solid pure magenta (#FF00FF) background, no shadows, no text, no grid lines.
- **shawn_thumbs**: Using the attached sprite sheet as the exact character reference (same pixel style, same proportions, same outfit and colours), draw ONE single frame of the same chibi character Shawn facing the viewer, standing still, grinning, giving a big DOUBLE THUMBS-UP with both hands. Exactly the same size as one frame of the reference. Square 1024x1024. Flat solid pure magenta (#FF00FF) background, no shadows, no text.

`shawn_thumbs` was generated with `raw/shawn_walk.png` attached as the reference image.

## Retries

- `tile_paving`, `tile_grass`, `tile_flowers`, `tile_asphalt`: the first attempts (`raw/*_v1.png`) drew whole garden/crossroads scenes instead of a plain texture (grass inside paving, bricks inside grass, a crossroads with lawns for asphalt). Regenerated with the "ONLY … Nothing else: …" wording above.
- `test_lamp.png`: the first test call, used to check the route works. Not used in the game.

## Full prompts

Each final prompt sent to `image_gen` is the style prefix + the asset's own text + its ending (object suffix for sprites, tile suffix for tiles; `shawn_walk` and `shawn_thumbs` carry their own ending inline), joined with no extra separators. `tools/jobs.py` holds the exact joined strings (`STYLE + JOBS[name]`, and `STYLE + REF_JOBS[name]` for the thumbs-up). The Codex session records confirm each of the 31 prompts reached `image_gen` unchanged (its `revisedPrompt` equals the prompt sent).

## Superseded and test prompts (verbatim from the Codex session records)

### First-attempt tiles (`raw/*_v1.png`)

These are the complete prompts `image_gen` received for the first attempts, before the retries above.

**tile_paving_v1**

```text
Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo. Sandy beige square paving slabs, 2x2 large slabs with thin darker grout lines, very subtle speckle. This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.
```

**tile_asphalt_v1**

```text
Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo. Dark blue-grey asphalt road surface, smooth with a few tiny lighter specks. This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.
```

**tile_grass_v1**

```text
Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo. Bright teal-green lawn grass with a few small darker grass tufts (little 'v' shaped blades) scattered evenly. This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.
```

**tile_flowers_v1**

```text
Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. Entirely original design, not copied from or imitating any existing game, character or logo. Flower bed: rich brown soil densely planted with small round pixel flowers in yellow, cream and pink with green leaves. This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.
```

### Test lamp (`raw/test_lamp.png`)

My request to Codex (the whole message given to `codex exec`):

```text
Use your built-in image_gen tool (not the CLI, no API key) to generate ONE image: a pixel-art black heritage street lamp post, top-down 3/4 handheld RPG style, dark 1px outline, flat magenta #FF00FF background. Then copy the generated PNG file to ./assets/raw/test_lamp.png. Reply with just the final path.
```

The prompt Codex wrote from it and passed to `image_gen`:

```text
Generate ONE image. Use case: stylized-concept. Asset type: pixel-art RPG prop sprite. Subject: a single black heritage street lamp post, ornate traditional cast iron base and shaft with a classic lantern on top. Style: top-down 3/4 handheld RPG pixel art, crisp square pixel edges, dark 1px outline, restrained flat pixel shading. Composition: entire lamp visible, centered, isolated with space around it. Background: perfectly flat solid magenta #FF00FF across the entire canvas. No ground, scenery, text, watermark, gradients, antialiasing or extra objects.
```
