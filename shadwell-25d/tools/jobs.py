"""Asset prompt set. One shared style prefix for everything."""
STYLE = ("Original pixel-art game asset for a 2010s handheld (DS-era) style top-down RPG. "
         "Steep top-down 3/4 view (camera high, looking down at about 60 degrees, so we see the front face and a sliver of the top). "
         "Clean crisp chunky square pixels, flat colour shading with 2-3 tones per material, absolutely no dithering, no noise, no gradients, no anti-aliasing blur. "
         "Dark 1px outlines around shapes. Bright cheerful palette (teal-green grass, sandy paving, warm red-brown bricks). Light comes from the top-left. "
         "Entirely original design, not copied from or imitating any existing game, character or logo. ")
OBJ = (" Show ONE isolated object, centred, whole object visible with margin around it, on a perfectly flat solid pure magenta (#FF00FF) background. "
       "No cast shadow on the ground, no ground plane, no scenery, no border, no extra text or labels.")
TILE = (" This is a single seamless repeating ground texture tile viewed straight down (orthographic, no perspective), filling the entire square image edge to edge, "
        "designed on a 16x16 grid of big pixels so it tiles seamlessly on all four sides. No border, no objects, no text. Square 1024x1024.")

JOBS = {
 # ground tiles
 "tile_paving": "ONLY plain sandy beige square concrete paving slabs: exactly 2x2 equal square slabs separated by thin slightly darker grout lines, flat colour with a few tiny specks. Nothing else: no grass, no plants, no bricks, no borders." + TILE,
 "tile_brick": "Warm red-brown brick paving laid in a herringbone pattern, thin light mortar." + TILE,
 "tile_asphalt": "ONLY plain dark blue-grey asphalt road surface: one flat colour with a few tiny lighter specks scattered evenly. Nothing else: no road markings, no grass, no kerbs, no paving, no crossroads." + TILE,
 "tile_kerb": "Road edge tile: top quarter is a light grey stone kerb strip running horizontally, below it dark blue-grey asphalt with two parallel bright yellow lines running horizontally close to the kerb (UK double yellow lines). Tiles seamlessly left-right." + TILE,
 "tile_grass": "ONLY uniform bright teal-green lawn grass: one flat green base colour with a few small darker green grass tufts (little v-shaped blades) scattered evenly. Nothing else: no paths, no stones, no bricks, no dirt, no sand patches." + TILE,
 "tile_flowers": "ONLY a dense flower bed texture: small round pixel flowers in yellow, cream and pink with green leaves packed evenly over dark soil, covering the whole tile uniformly. Nothing else: no paths, no paving, no borders, no edging, no planters." + TILE,
 # station
 "station": ("A large London railway station front building, wide landscape composition 1536x1024. Left part: a dark chocolate-brown brick two-storey block. "
   "Across its upper wall, big chunky red 3D block letters spelling exactly SHADWELL. Below the letters, a flat grey cantilevered concrete canopy sticking out over the entrance, "
   "with 4 round warm yellow downlights on its underside. Under the canopy a wide open entrance showing a bright tiled ticket hall inside with a row of grey ticket gates. "
   "A small white rectangular sign reading NO ENTRY hangs above the entrance. Right part: a lower one-storey brick wing with a 4-panel poster board on its wall, "
   "a small round blue no-parking sign, a little CCTV camera on a bracket, a small red box at the base of the wall, and a round sign on a bracket sticking out from the wall: a red ring with a blue horizontal bar across it reading OVERGROUND in white."
   + OBJ),
 # buildings
 "flats": "A cream-coloured 5-storey modern block of flats, rectangular, with rows of windows and small balconies with metal railings, flat roof, a glass entrance door at ground level. Portrait composition 1024x1536." + OBJ,
 "yellow_house": "A London yellow stock brick 3-storey house with a red clay tiled pitched roof, white sash windows, a black front door with a fanlight. Square 1024x1024." + OBJ,
 "shop_corner": "A London Victorian terraced house, 2 storeys, red brick upper floor with two sash windows, ground floor corner shop front with green fascia sign reading BEN'S BITS, a window full of goods and a striped awning. Portrait 1024x1536." + OBJ,
 "shop_cafe": "A London Victorian terraced house, 2 storeys, pale painted stucco upper floor with two sash windows, ground floor cafe shopfront with a cream and teal fascia reading TEA TIME, big window with little tables and a coffee cup decal. Portrait 1024x1536." + OBJ,
 "shop_laundry": "A London Victorian terraced house, 2 storeys, brown brick upper floor with two sash windows, ground floor launderette shopfront with a blue fascia reading SUDS, a window showing a row of round washing machines. Portrait 1024x1536." + OBJ,
 "viaduct": "A long straight Victorian red-brick railway viaduct seen from the side and slightly above: a row of 4 tall round brick arches with a flat parapet on top and dark railway track along the top. Wide landscape 1536x1024, viaduct spans the full width." + OBJ,
 "train": "A short modern commuter train, 2 carriages, seen from the side and slightly above: white body with an orange stripe along the bottom and orange doors, dark windows, grey roof. Very wide landscape 1536x1024, train spans almost full width." + OBJ,
 # props
 "lamp": "A black Victorian heritage street lamp post with a lantern head glowing warm yellow. Tall and thin, portrait 1024x1536." + OBJ,
 "bollard": "A short black cast-iron street bollard with a rounded top and a thin gold band. Square 1024x1024." + OBJ,
 "cycle_stand": "A black steel Sheffield-style bike stand (inverted U hoop) with two yellow reflective bands. Square 1024x1024." + OBJ,
 "aboard": "A white folding A-frame pavement sign with a red border reading NO ENTRY in bold black letters. Square 1024x1024." + OBJ,
 "tree": "A round leafy street tree with a bushy bright green crown and a short brown trunk. Square 1024x1024." + OBJ,
 "hedge": "A low rectangular trimmed green hedge block, long and short, seen from slightly above. Landscape 1536x1024." + OBJ,
 "bin_grey": "A grey plastic wheelie bin with a lid and two wheels. Square 1024x1024." + OBJ,
 "bin_purple": "A purple plastic wheelie bin with a lid and two wheels. Square 1024x1024." + OBJ,
 "car_red": "A small cute red hatchback car seen from the side and slightly above, facing right. Landscape 1536x1024." + OBJ,
 "car_blue": "A small cute sky-blue compact car seen from the side and slightly above, facing left. Landscape 1536x1024." + OBJ,
 # player
 "shawn_walk": ("Character sprite sheet for a chibi player character called Shawn (big head, small body, about 2.5 heads tall). "
   "He is a young East Asian man with short dark hair and a full fringe, round dark-rimmed glasses and a big grin. He wears a glossy red puffer jacket worn open over a light grey T-shirt, "
   "a purple lanyard with a white badge covered in coloured dots, wide-leg mid-blue jeans and dark grey trainers. "
   "Layout: a strict grid of 4 rows x 3 columns, every cell the same size, characters evenly spaced and not touching. Row 1: walking DOWN toward the viewer (frames: left foot forward, standing, right foot forward). "
   "Row 2: walking LEFT (3 frames). Row 3: walking RIGHT (3 frames). Row 4: walking UP away from the viewer, back view (3 frames). Same character, same size and same colours in every frame. Square 1024x1024."
   " Flat solid pure magenta (#FF00FF) background, no shadows, no text, no grid lines."),
}
# generated after shawn_walk, with it attached as a reference image
REF_JOBS = {
 "shawn_thumbs": ("Using the attached sprite sheet as the exact character reference (same pixel style, same proportions, same outfit and colours), draw ONE single frame of the same chibi character Shawn "
   "facing the viewer, standing still, grinning, giving a big DOUBLE THUMBS-UP with both hands. Exactly the same size as one frame of the reference. Square 1024x1024."
   " Flat solid pure magenta (#FF00FF) background, no shadows, no text."),
}
