# SPEC — Day-in-the-Life Pixel Worlds (working name: **DayQuest**)

> 4-hour hackathon build, 3 people. This doc is the source of truth — if you change a decision, change it here.

## 1. Pitch

**Who:** long-distance partners (and later, friends).
**Problem:** you can see *where* your partner is and hear *what* they did, but you can't *see* their day.
**What:** at the end of the day, DayQuest turns your location history, photos, workouts and an outfit "fit check" into **three playable, Pokémon-Emerald-inspired pixel scenes**. Your partner opens a link, walks your character around the places you went, and reads what you did. Between scenes, a pixel animation shows the actual London transport you took (red bus, tube line).

## 2. Locked decisions

| Area | Decision |
|---|---|
| Platform | Web app (desktop browser is fine), Next.js on Vercel |
| Engine | Phaser 3 + [Grid Engine](https://github.com/Annoraaq/grid-engine). **Not** the pokeemerald decomp (1–2h toolchain, 16-colour palette limits, ROM = Nintendo IP, can't share publicly) |
| Look | Emerald-inspired 3/4 top-down pixel art. Start Emerald-faithful, push to 2.5D (depth sort, shadows, parallax) if time |
| Base tiles | [Puny World](https://opengameart.org/content/16x16-puny-world-tileset) (CC0) for ground/paths/trees. Only landmarks, food and the player are AI-generated |
| Highlights | Exactly **3** per day: **touristy spot**, **meal**, **park**. Chosen by Codex/LLM from the raw day. The demo uses the fixed template day in §2.1 |
| Landmarks | LLM picks 3 memorable landmarks near each highlight → any reference photo (Wikipedia lead image is fine) → gpt-image-2.5 → pixel post-process → fixed footprint |
| Player | One **back-facing** sprite (third-person, we follow them from behind) generated from today's fit-check photo: clothes, hair, skin. No walk cycle — slide between tiles with a small bob |
| Interaction | Free play: arrow keys to walk, Space/Enter near a landmark → textbox |
| Text | Plain textbox, no game jokes. e.g. "Had tonkotsu ramen at Kanada-Ya." Meal textbox shows a small pixel food icon |
| Transitions | Exit tile on scene edge → 2D pixel **transport loading animation** (red bus w/ route number, or tube train in line colour w/ station names) → next scene |
| Data in | Hardcoded `data/input.json` (location history, transport legs, workouts) + real uploaded photos |
| Sharing | `/day/<id>` link, no accounts. Demo day also committed to `public/days/demo/` as fallback |
| Ingest UI | A **"Today" screen** that visibly ingests the day: location history syncing onto a map, photo upload slots (fit check, lunch, landmark, park), health import, auto-detected transport, then a live generation log. See §6.1 |
| Live on stage | Environment pre-generated. Live: upload fit check + ramen photo on the Today screen → sprite generated → walks into the scene |
| Video / Sora | No. Sora API is removed; no download-clip feature |
| Out of scope | World journal (pitch slide only), accounts, feeds, real HealthKit/Strava, 3D, battle screens |

## 2.1 Template day (the demo)

A Saturday in London. This is what `data/input.json` hardcodes and what gets pre-generated into `public/days/demo/`.

| # | Time | Scene | Base map | 3 landmarks (generated) | Textbox content |
|---|---|---|---|---|---|
| 1 | 10:00–12:00 | **Touring Westminster** | `city` (riverside: Thames along the top edge, Westminster Bridge crossing it) | Elizabeth Tower (Big Ben) + Houses of Parliament (L), London Eye (L, across the river), red phone box (S). **The Shard** sits on the parallax skyline behind, not walkable | Walked Westminster Bridge, rode the London Eye, photo of Big Ben |
| 2 | 12:40–13:30 | **Ramen lunch** | `street` (narrow Soho/St Giles street) | Kanada-Ya ramen shopfront (M), Centre Point tower (L), red phone box or a noren-curtained side shop (S). **Food:** tonkotsu ramen bowl sprite sits on a small outdoor table by the door, and the same sprite appears in the textbox | "Had tonkotsu ramen at Kanada-Ya" + what was ordered |
| 3 | 14:15–15:30 | **Walk in Regent's Park** | `park` (paths, flower beds, lake on one side) | Queen Mary's Rose Garden gates (M), Triton Fountain (M), boating lake with swans + bandstand (L) | Walk stats: distance, time, steps |

**Transport between scenes (§7):**

| Leg | Mode | Route | Animation |
|---|---|---|---|
| 1 → 2 | **Bus** | Route **24**, *Parliament Square* → *Tottenham Court Road Station* (via Whitehall, Trafalgar Square, Charing Cross Road), ~20 min | Red double-decker with "24 Hampstead Heath" on the blind, passing Nelson's Column |
| 2 → 3 | **Tube** | Walk to Tottenham Court Road → **Central line** (red, `#E32017`) 1 stop to *Oxford Circus* → change → **Bakerloo line** (brown, `#B36305`) 1 stop to *Regent's Park*, ~15 min | Red train, "CHANGE AT OXFORD CIRCUS" card, brown train. If short on time, show the Bakerloo leg only |

**Data still needed from the team** (everything else is hardcoded below):
1. **Fit-check photo:** full body, head to shoes, plain background, good light. A back-view photo as well helps a lot, since the sprite is seen from behind.
2. **Photos for each scene** (optional but makes it personal): Westminster/Eye, the ramen bowl from above, the park. Real or stand-ins; EXIF gets stripped.
3. **Display name** for the textbox (e.g. `LUCAS`) and whose day it is (you or your partner).
4. **Walk stats** for the park: distance, duration, steps (or we use the placeholders below).
5. **What was ordered** at lunch (default: tonkotsu ramen + gyoza).
6. **Confirm or swap** the restaurant (Kanada-Ya St Giles) and park (Regent's Park). Swapping means changing the coordinates and transport in §4.1.

## 3. Architecture

```
Today screen (/)  ── location history (data/input.json) animates in
                  ── photos  ──► POST /api/upload  (strip EXIF → Blob)
                  ── fit check ─► POST /api/fit-check (sprite, live)
                  ── "END MY DAY"
        │
        ▼
POST /api/generate-day ──► streams NDJSON progress events to the Generating screen
                           1. pick highlights (LLM, structured output)
                           2. pick 3 landmarks per highlight (LLM)
                           3. fetch reference images (Wikipedia REST)
                           4. gpt-image-2.5 edits (transparent PNG)
                           5. pixel post-process (sharp)
                           6. write day.json + PNGs → Vercel Blob
        │
        ▼ { id }
/day/<id>  ──► Phaser loads day.json + PNGs at runtime → 3 scenes + transport transitions

POST /api/fit-check (photo) ──► gpt-image-2.5 → post-process → player.png  (live demo)
```

### Repo layout (target)

```
app/
  page.tsx                 # Today screen: timeline, upload slots, health, transport, END MY DAY
  generating/page.tsx      # retro progress log reading the generate-day stream
  day/[id]/page.tsx        # loads day.json, mounts Phaser
  api/upload/route.ts
  api/generate-day/route.ts
  api/fit-check/route.ts
components/today/          # LocationSync, UploadSlot, HealthCard, TransportCard
game/
  main.ts                  # Phaser config (pixelArt: true, zoom 3)
  scenes/HighlightScene.ts # one scene, parameterised by a highlight
  scenes/TransitScene.ts   # bus/tube loading animation
  ui/TextBox.ts            # 9-slice box + typewriter text
pipeline/
  highlights.ts            # LLM: raw day -> 3 highlights + landmarks
  references.ts            # Wikipedia lead images
  imagegen.ts              # OpenAI image edits
  pixelate.ts              # sharp post-process
data/input.json            # hardcoded day
public/tiles/              # Puny World
public/transit/            # bus.png, tube.png, skyline.png
public/days/demo/          # pre-generated fallback day
```

## 4. Data contracts

**Agree these in the first 15 minutes.** A builds against a hand-written `public/days/demo/day.json` while B makes it real.

### 4.1 `data/input.json` (hardcoded)

```jsonc
{
  "user": { "name": "LUCAS", "fitCheckPhoto": "photos/fit.jpg", "fitCheckBackPhoto": "photos/fit_back.jpg" },
  "date": "2026-11-07",
  "locations": [
    { "t": "10:00", "lat": 51.5007, "lng": -0.1246, "label": "Elizabeth Tower / Parliament Square" },
    { "t": "10:25", "lat": 51.5009, "lng": -0.1220, "label": "Westminster Bridge" },
    { "t": "10:45", "lat": 51.5033, "lng": -0.1196, "label": "London Eye" },
    { "t": "12:05", "lat": 51.5010, "lng": -0.1260, "label": "Parliament Square bus stop" },
    { "t": "12:30", "lat": 51.5163, "lng": -0.1303, "label": "Tottenham Court Road Station" },
    { "t": "12:40", "lat": 51.5157, "lng": -0.1281, "label": "Kanada-Ya, 64 St Giles High St" },
    { "t": "13:40", "lat": 51.5165, "lng": -0.1310, "label": "Tottenham Court Road Station" },
    { "t": "13:50", "lat": 51.5152, "lng": -0.1419, "label": "Oxford Circus Station" },
    { "t": "14:00", "lat": 51.5234, "lng": -0.1466, "label": "Regent's Park Station" },
    { "t": "14:15", "lat": 51.5268, "lng": -0.1530, "label": "Queen Mary's Gardens" },
    { "t": "14:50", "lat": 51.5274, "lng": -0.1555, "label": "Triton Fountain" },
    { "t": "15:20", "lat": 51.5262, "lng": -0.1590, "label": "Regent's Park Boating Lake" }
  ],
  "transport": [
    { "from": "Parliament Square", "to": "Tottenham Court Road Station", "mode": "bus", "route": "24",
      "destination": "Hampstead Heath", "via": ["Whitehall", "Trafalgar Square", "Charing Cross Road"] },
    { "from": "Tottenham Court Road", "to": "Oxford Circus", "mode": "tube", "line": "Central",
      "stations": ["Tottenham Court Road", "Oxford Circus"] },
    { "from": "Oxford Circus", "to": "Regent's Park", "mode": "tube", "line": "Bakerloo",
      "stations": ["Oxford Circus", "Regent's Park"] }
  ],
  "photos": [
    { "path": "photos/westminster.jpg", "t": "10:20", "note": "Big Ben from the bridge" },
    { "path": "photos/eye.jpg",         "t": "11:10", "note": "view from the top of the Eye" },
    { "path": "photos/ramen.jpg",       "t": "12:55", "note": "tonkotsu ramen and gyoza" },
    { "path": "photos/park.jpg",        "t": "14:30", "note": "rose garden" }
  ],
  "workouts": [
    { "t": "14:15", "type": "walk", "distanceKm": 3.8, "durationMin": 75, "steps": 5200 }
  ],
  "notes": "Saturday tourist day. Lunch order: tonkotsu ramen + gyoza."
}
```

### 4.2 `day.json` (pipeline output, consumed by the game)

```jsonc
{
  "id": "k3x9q2",                         // unguessable, nanoid(10)
  "date": "2026-11-01",
  "player": { "name": "LUCAS", "sprite": "player.png" },   // back-facing, 32x48 px
  "scenes": [
    {
      "kind": "tourist" | "meal" | "park",
      "title": "Touring Westminster",
      "time": "10:00",
      "base": "city" | "street" | "park",  // which hand-made Puny World base map
      "skyline": "shard.png",              // optional parallax backdrop (scene 1 only)
      "spawn": { "x": 10, "y": 13 },
      "exit":  { "x": 19, "y": 7 },        // last scene's exit -> end card
      "landmarks": [
        {
          "name": "London Eye",
          "sprite": "s0_l0.png",
          "footprint": "L",                // S=3x3, M=4x4, L=5x4 tiles (16px tiles)
          "slot": 0,                       // base map defines slot positions
          "text": "Rode the London Eye. Clear view all the way to St Paul's."
        }
      ],
      "food": {                            // meal scene only
        "sprite": "s1_food.png",           // shown on a table in the world AND in the textbox
        "tile": { "x": 9, "y": 8 },
        "text": "Had tonkotsu ramen and gyoza at Kanada-Ya."
      }
    }
  ],
  "transit": [                              // transit[i] plays between scenes[i] and scenes[i+1]
    { "legs": [
      { "mode": "bus", "route": "24", "destination": "Hampstead Heath",
        "from": "Parliament Square", "to": "Tottenham Court Road" } ] },
    { "legs": [
      { "mode": "tube", "line": "Central",  "color": "#E32017", "stations": ["Tottenham Court Road", "Oxford Circus"] },
      { "mode": "tube", "line": "Bakerloo", "color": "#B36305", "stations": ["Oxford Circus", "Regent's Park"] } ] }
  ]
}
```

Asset paths are relative to the `day.json` URL.

## 5. Pipeline details (owner: B)

### 5.1 Highlight + landmark selection (Codex / LLM)
One Responses API call with structured output (JSON schema = `scenes[]` without sprites). Prompt:

> You are given one person's day in London (locations, photos, workouts, transport). Pick exactly 3 highlights: one touristy spot, one meal, one park. For each, choose the 3 most memorable, visually recognisable landmarks within ~300 m that would read well as a single pixel-art building or object. Give each a footprint (S/M/L) and a one-sentence, plain, first-person-past-tense textbox line grounded in the data. No jokes, no game references.

Also log this call as the **"Use of Codex"** example if it's the cleanest one.

### 5.2 Reference images
For each landmark name: `GET https://en.wikipedia.org/api/rest_v1/page/summary/<title>` → `originalimage.source`. If nothing, use the user's photo; if nothing, text-only. Don't over-engineer — accuracy is not the goal.

### 5.3 Image generation
- Model: `gpt-image-2.5-flare` (fast) for live; `gpt-image-2.5-sunburst` for pre-generating the demo day if style looks off.
- Endpoint: `images.edit` with references, `background: "transparent"`, `output_format: "png"`, `size: "1024x1024"`, `quality: "medium"`.
- Run all landmark calls in parallel (`Promise.all`, cap ~6 concurrent). Expect 10–60 s each.

**Style prefix (identical on every call — this is what keeps scenes consistent):**
> Game Boy Advance era Pokémon Emerald style pixel art, 3/4 top-down view, clean dark outlines, limited bright palette, soft top-left lighting, single isolated object centred on a fully transparent background, no ground, no text, no UI.

| Asset | Prompt suffix |
|---|---|
| Landmark | `A {footprint} building/object sprite of {name}, simplified and recognisable. {userNote}` |
| Food icon | `A small item icon of {food}, viewed from slightly above.` |
| Player (fit check) | `A single chibi trainer character seen directly from BEHIND (back view, face not visible), full body, standing, matching this person's clothing, colours, hairstyle and hair colour, and skin tone exactly. Neutral pose, arms at sides.` Pass the front photo, plus the back photo if there is one |
| Food (world + textbox) | Same as the food icon, generated once at 1024 and pixelated twice: 16×16 for the in-world table, 32×32 for the textbox |

### 5.4 Pixel post-process (`pixelate.ts`, sharp)
1. Trim transparent edges.
2. Resize **nearest-neighbour** to target pixel size: S=48×48, M=64×64, L=80×64, food=16×16, player=32×48.
3. Quantise to ≤32 colours (`png({ palette: true, colors: 32, dither: 0 })`).
4. Threshold alpha (α < 128 → 0, else 255) — no soft edges.
5. Game renders at zoom 3 with `pixelArt: true`; never upscale in the PNG.

Strip EXIF from every uploaded photo before storing (`sharp().rotate()` drops metadata by default).

## 6. Game details (owner: A)

- **Resolution:** 320×240 logical (20×15 tiles of 16 px), `zoom: 3`, `pixelArt: true`, `roundPixels: true`.
- **Base maps:** 3 hand-made Puny World maps (city = Westminster riverside, street = St Giles, park = Regent's Park) built in code from 2D arrays or in Tiled. Each defines 3 **landmark slots** (top-left tile + max footprint), `spawn`, `exit`.
- **Landmarks:** `this.load.image` at runtime from `day.json`; placed as sprites with origin bottom-centre at slot. Mark footprint tiles as colliders in Grid Engine.
- **Depth sort (the 2.5D feel):** every frame `sprite.setDepth(sprite.y)` for player and landmarks so you walk *behind* tall buildings. Add an ellipse drop shadow under each landmark and the player.
- **Player:** single back-facing frame (camera follows from behind, third person). On `movementStarted`, a 2-px y bob tween; no directional frames. Spawn at the bottom of each map so the first move is "up", into the scene.
- **Food in the world:** the meal scene places the food sprite on a small table tile by the restaurant door; facing it + Space opens the meal textbox with the larger food icon.
- **Textbox:** bottom 9-slice box, pixel font (Press Start 2P or similar), typewriter at ~40 chars/s, Space to advance. Opens when facing a landmark's footprint tile and pressing Space. Meal scene shows the food icon left of the text.
- **Scene card:** on enter, a 1.5 s banner: `10:30 · LONDON EYE`.
- **Exit tile:** a path tile at the map edge; stepping on it → fade out → `TransitScene` → next `HighlightScene`. After scene 3 → end card with **Share** button (copies `location.href`).
- **Stretch:** parallax skyline layer behind the top of the map; ambient chiptune loop.

## 6.1 Today screen: ingesting the day (owner: C)

The judges should *see* the day's data going in. Same pixel font and 9-slice boxes as the game, laid out like a retro menu. Sections, top to bottom:

1. **Location sync.** On load: `SYNCING LOCATION HISTORY…` with a chunky pixel progress bar, then a pixelated map of central London (one static image, pixelated with `pixelate.ts`) where stops from `input.json` pop in one by one in time order, joined by a dotted route. Beside it a timeline ticks in: `10:00 PARLIAMENT SQUARE ✓`, `12:40 KANADA-YA ✓`, … Data is hardcoded; the animation is what sells it.
2. **Today's photos.** Upload slots styled as quest cards, each with a check box:
   - `FIT CHECK` (required): front photo, optional back photo
   - `LUNCH`: the ramen photo
   - `LANDMARK` and `PARK` (optional)

   Each slot is `<input type="file" accept="image/*" capture="environment">` plus drag-and-drop. On upload: the thumbnail appears **pixelated in the browser** (canvas, nearest-neighbour) as instant feedback, `exifr` reads the photo's time client-side and matches it to the nearest stop (`MATCHED TO 12:40 · KANADA-YA`), then the file goes to `/api/upload` and the quest ticks off. Uploading the fit check also fires `/api/fit-check` so the sprite is ready by the time the day is generated.
3. **Health.** `IMPORT FROM HEALTH` button → 1.5 s fake sync → card shows the hardcoded walk: `WALK · 3.8 KM · 75 MIN · 5,200 STEPS`.
4. **Transport.** Auto-detected legs with line chips: a red `BUS 24` chip, a red `CENTRAL` chip and a brown `BAKERLOO` chip.
5. **`END MY DAY`** button (enabled once the fit check is in) → `/generating`.

**Generating screen** (owner: B). Reads the NDJSON stream from `/api/generate-day` and prints a retro log, one line per event, with thumbnails popping in as each image finishes:

```
> PICKING TODAY'S 3 HIGHLIGHTS…        WESTMINSTER · KANADA-YA · REGENT'S PARK
> FINDING LANDMARKS NEAR WESTMINSTER… BIG BEN · LONDON EYE · PHONE BOX
> PAINTING BIG BEN…                    [thumb]
> PIXELATING…                          ✓
> BUILDING YOUR WORLD…                 → /day/<id>
```

Event shape: `{ "step": "highlights" | "landmarks" | "image" | "pixelate" | "done", "label": string, "thumb"?: string, "id"?: string }`.
For the demo, `/generating?replay=demo` replays `public/days/demo/events.ndjson` (recorded from the real pre-generation run) with the timing compressed, so the log is genuine output, just not live.

## 7. Transport transitions (owner: A)

`TransitScene` (~4 s per leg, skippable with Space) plays each entry in `transit[i].legs` in order:
- **Bus (1 → 2):** red double-decker drives left→right over a scrolling skyline (Whitehall → Nelson's Column → Charing Cross Road). Blind reads `24 HAMPSTEAD HEATH`; caption `PARLIAMENT SQUARE → TOTTENHAM COURT ROAD`.
- **Tube (2 → 3):** tunnel background, train sprite tinted with the line colour, roundel with the line name, station board ticking `stations[]`. Central (red) → a 1 s `CHANGE AT OXFORD CIRCUS` card → Bakerloo (brown).
- Assets are **static and pre-made** (`public/transit/`), not generated per day — this must never fail live.

TfL line colours: Bakerloo `#B36305`, Central `#E32017`, Circle `#FFD300`, District `#00782A`, Hammersmith & City `#F3A9BB`, Jubilee `#A0A5A9`, Metropolitan `#9B0056`, Northern `#000000`, Piccadilly `#003688`, Victoria `#0098D4`, Waterloo & City `#95CDBA`, Elizabeth `#6950A1`.

## 8. API routes

| Route | In | Out |
|---|---|---|
| `POST /api/upload` | `multipart` photo, `kind` = `fit` \| `fit_back` \| `lunch` \| `landmark` \| `park` | `{ url }`; EXIF stripped, stored under `uploads/<session>/` in Blob |
| `POST /api/generate-day` | `{ uploads: { kind: url }[] }` (+ reads `data/input.json`) | NDJSON stream of progress events (§6.1); last event has `id`. Writes `days/<id>/day.json` + PNGs to Blob |
| `POST /api/fit-check` | `multipart` photo, `dayId` | `{ spriteUrl }`; overwrites `player.png` for that day |
| `GET /day/[id]` | — | page; fetches `day.json` from Blob (or `public/days/demo/` when `id=demo`) |

Keys (`OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`) are server-side env vars only — never in client code or the repo.

## 9. Team split & timeline (3 people)

| Time | **A — Game + transit** | **B — Pipeline + generating log** | **C — Today screen, character, ship** |
|---|---|---|---|
| 0:00–0:15 | **All:** agree §4 contracts + §6.1 event shape, scaffold Next.js + Phaser, A commits fake `public/days/demo/day.json` | | |
| 0:15–1:30 | One walkable scene: base map, Grid Engine, depth sort, placeholder landmarks, textbox | Highlight/landmark LLM call + Wikipedia refs + first landmark end-to-end through `pixelate.ts` | `/api/upload` + `/api/fit-check` → back-facing sprite; Today screen layout with upload slots |
| 1:30–2:30 | 3 base maps, exit tiles, scene cards, `TransitScene` bus + tube | Full `/api/generate-day` streaming NDJSON → Blob; food sprites; `/generating` log screen | Location sync animation, EXIF matching, health + transport cards, `/day/[id]` route |
| 2:30–3:15 | Wire real `day.json`, food on the table, polish 2.5D (shadows, depth) | Pre-generate demo day, record `events.ndjson`, lock prompts | Deploy to Vercel, run the full flow end to end, test share link in incognito |
| 3:15–4:00 | **Feature freeze. All:** README, Codex screenshots, record 90 s video, strip keys/EXIF, submit | | |

**Cut order if behind:** food in the world (keep textbox icon) → per-line tube colour (one generic train) → pixel map in location sync (keep the ticking timeline) → depth sort/shadows → Vercel Blob (serve only the committed demo day).

## 10. 90-second demo script

1. **0–10 s** — Problem: "My partner's in London, I'm not. I know where she is, I can't *see* her day."
2. **10–30 s** — **Today screen, live.** Location history syncs onto the pixel map. Upload the fit check and the ramen photo; both pixelate instantly and match to their stops. Import the walk; transport chips appear. Hit **END MY DAY**.
3. **30–40 s** — **Generating log** (cut down): highlights picked, landmarks found, Big Ben and the ramen bowl pop in as pixel art.
4. **40–80 s** — **Play the day.** The back-facing sprite (from the fit check) walks up into Westminster (Big Ben, London Eye, Shard on the skyline; read a textbox) → exit tile → **bus 24** → Kanada-Ya (ramen bowl on the table, textbox) → **Central → Bakerloo** → Regent's Park (walk stats).
5. **80–90 s** — Hit **Share**, show the link. "Every day becomes a place you can visit." (World journal = one-line vision.)

## 11. Submission checklist

- [ ] Project name + description (who / problem / what) — §1
- [ ] Team names + contact email
- [ ] Public GitHub repo with README, setup instructions, what we built today
- [ ] Demo video ≤ 90 s
- [ ] **Use of Codex** — one concrete example (prompt + diff screenshot). Candidates: `pixelate.ts`, the highlight-selection prompt/schema, `TransitScene`
- [ ] App link + "how to try it" (`/day/demo`)
- [ ] Links open without login/permission prompts (test in incognito)
- [ ] No API keys in repo; no EXIF GPS or personal data in committed photos

## 12. Risks

| Risk | Mitigation |
|---|---|
| AI sprites look inconsistent | One fixed style prefix, aggressive post-process (same palette size, alpha threshold), pre-generate demo |
| Puny World (flat top-down) clashes with 3/4 landmarks | Judge on the first generated landmark at 0:45; if bad, generate one Emerald-style ground/path sheet instead |
| Image gen slow/failing on stage | Only the fit check is live; demo day is committed; cut the wait in the video |
| Sprite scale wrong vs 16 px tiles | Fixed target pixel sizes in §5.4; never let the model decide size |
| Nintendo IP | "Emerald-inspired": no Pokémon names, sprites, fonts or music in the shipped app |
