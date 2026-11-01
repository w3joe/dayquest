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
| Highlights | Exactly **3** per day: **touristy spot**, **meal**, **park**. Chosen by Codex/LLM from the raw day |
| Landmarks | LLM picks 3 memorable landmarks near each highlight → any reference photo (Wikipedia lead image is fine) → gpt-image-2.5 → pixel post-process → fixed footprint |
| Player | One **front-facing** sprite generated from today's fit-check photo (clothes, skin, hair). No walk cycle — slide between tiles with a small bob |
| Interaction | Free play: arrow keys to walk, Space/Enter near a landmark → textbox |
| Text | Plain textbox, no game jokes. e.g. "Had tonkotsu ramen at Kanada-Ya." Meal textbox shows a small pixel food icon |
| Transitions | Exit tile on scene edge → 2D pixel **transport loading animation** (red bus w/ route number, or tube train in line colour w/ station names) → next scene |
| Data in | Hardcoded `data/input.json` (location history, transport legs, workouts) + real uploaded photos |
| Sharing | `/day/<id>` link, no accounts. Demo day also committed to `public/days/demo/` as fallback |
| Live on stage | Environment pre-generated. Live: take fit-check photo → sprite generated → walks into the scene |
| Video / Sora | No. Sora API is removed; no download-clip feature |
| Out of scope | World journal (pitch slide only), accounts, feeds, real HealthKit/Strava, 3D, battle screens |

## 3. Architecture

```
data/input.json + photos
        │
        ▼
POST /api/generate-day ──► 1. pick highlights (LLM, structured output)
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
  page.tsx                 # "End my day" + fit-check upload
  day/[id]/page.tsx        # loads day.json, mounts Phaser
  api/generate-day/route.ts
  api/fit-check/route.ts
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
  "user": { "name": "LUCAS", "fitCheckPhoto": "photos/fit.jpg" },
  "date": "2026-11-01",
  "locations": [
    { "t": "09:10", "lat": 51.5246, "lng": -0.1340, "label": "UCL" },
    { "t": "10:30", "lat": 51.5033, "lng": -0.1196, "label": "London Eye" },
    { "t": "12:45", "lat": 51.5149, "lng": -0.1263, "label": "Kanada-Ya, Covent Garden" },
    { "t": "16:00", "lat": 51.5313, "lng": -0.1570, "label": "Regent's Park" }
  ],
  "transport": [
    { "from": "London Eye", "to": "Kanada-Ya, Covent Garden", "mode": "bus",  "route": "RV1" },
    { "from": "Kanada-Ya, Covent Garden", "to": "Regent's Park", "mode": "tube", "line": "Bakerloo",
      "stations": ["Charing Cross", "Piccadilly Circus", "Oxford Circus", "Regent's Park"] }
  ],
  "photos": [
    { "path": "photos/eye.jpg",   "t": "10:42", "note": "view from the pod" },
    { "path": "photos/ramen.jpg", "t": "12:50", "note": "tonkotsu ramen" }
  ],
  "workouts": [
    { "t": "16:05", "type": "walk", "distanceKm": 4.1, "durationMin": 52 }
  ],
  "notes": "free text the user adds, e.g. 'DIML office is the glass building on the corner'"
}
```

### 4.2 `day.json` (pipeline output, consumed by the game)

```jsonc
{
  "id": "k3x9q2",                         // unguessable, nanoid(10)
  "date": "2026-11-01",
  "player": { "name": "LUCAS", "sprite": "player.png" },   // front-facing, 32x48 px
  "scenes": [
    {
      "kind": "tourist" | "meal" | "park",
      "title": "London Eye",
      "time": "10:30",
      "base": "city" | "plaza" | "park",   // which hand-made Puny World base map
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
      "food": { "sprite": "s1_food.png", "text": "Had tonkotsu ramen at Kanada-Ya." } // meal scene only
    }
  ],
  "transit": [                              // transit[i] plays between scenes[i] and scenes[i+1]
    { "mode": "bus",  "route": "RV1", "from": "Waterloo", "to": "Covent Garden" },
    { "mode": "tube", "line": "Bakerloo", "color": "#B36305",
      "stations": ["Charing Cross", "Piccadilly Circus", "Oxford Circus", "Regent's Park"] }
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
| Player (fit check) | `A single front-facing chibi trainer character, full body, standing, matching this person's clothing, colours, skin tone and hairstyle exactly. Neutral pose, arms at sides.` |

### 5.4 Pixel post-process (`pixelate.ts`, sharp)
1. Trim transparent edges.
2. Resize **nearest-neighbour** to target pixel size: S=48×48, M=64×64, L=80×64, food=16×16, player=32×48.
3. Quantise to ≤32 colours (`png({ palette: true, colors: 32, dither: 0 })`).
4. Threshold alpha (α < 128 → 0, else 255) — no soft edges.
5. Game renders at zoom 3 with `pixelArt: true`; never upscale in the PNG.

Strip EXIF from every uploaded photo before storing (`sharp().rotate()` drops metadata by default).

## 6. Game details (owner: A)

- **Resolution:** 320×240 logical (20×15 tiles of 16 px), `zoom: 3`, `pixelArt: true`, `roundPixels: true`.
- **Base maps:** 3 hand-made Puny World maps (city, plaza, park) built in code from 2D arrays or in Tiled. Each defines 3 **landmark slots** (top-left tile + max footprint), `spawn`, `exit`.
- **Landmarks:** `this.load.image` at runtime from `day.json`; placed as sprites with origin bottom-centre at slot. Mark footprint tiles as colliders in Grid Engine.
- **Depth sort (the 2.5D feel):** every frame `sprite.setDepth(sprite.y)` for player and landmarks so you walk *behind* tall buildings. Add an ellipse drop shadow under each landmark and the player.
- **Player:** single front-facing frame. On `movementStarted`, a 2-px y bob tween; no directional frames.
- **Textbox:** bottom 9-slice box, pixel font (Press Start 2P or similar), typewriter at ~40 chars/s, Space to advance. Opens when facing a landmark's footprint tile and pressing Space. Meal scene shows the food icon left of the text.
- **Scene card:** on enter, a 1.5 s banner: `10:30 · LONDON EYE`.
- **Exit tile:** a path tile at the map edge; stepping on it → fade out → `TransitScene` → next `HighlightScene`. After scene 3 → end card with **Share** button (copies `location.href`).
- **Stretch:** parallax skyline layer behind the top of the map; ambient chiptune loop.

## 7. Transport transitions (owner: C)

`TransitScene` (~4 s, skippable with Space):
- **Bus:** hand-made/once-generated red double-decker sprite drives left→right over a scrolling London skyline; route number on the blind (`RV1`); text `WATERLOO → COVENT GARDEN`.
- **Tube:** tunnel background, train sprite tinted with the line colour, station name boards ticking past (`stations[]`), roundel with line name.
- Assets are **static and pre-made** (`public/transit/`), not generated per day — this must never fail live.

TfL line colours: Bakerloo `#B36305`, Central `#E32017`, Circle `#FFD300`, District `#00782A`, Hammersmith & City `#F3A9BB`, Jubilee `#A0A5A9`, Metropolitan `#9B0056`, Northern `#000000`, Piccadilly `#003688`, Victoria `#0098D4`, Waterloo & City `#95CDBA`, Elizabeth `#6950A1`.

## 8. API routes

| Route | In | Out |
|---|---|---|
| `POST /api/generate-day` | none (reads `data/input.json` + photos) | `{ id }`; writes `days/<id>/day.json` + PNGs to Vercel Blob |
| `POST /api/fit-check` | `multipart` photo, `dayId` | `{ spriteUrl }`; overwrites `player.png` for that day |
| `GET /day/[id]` | — | page; fetches `day.json` from Blob (or `public/days/demo/` when `id=demo`) |

Keys (`OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`) are server-side env vars only — never in client code or the repo.

## 9. Team split & timeline (3 people)

| Time | **A — Game** | **B — Pipeline** | **C — Character, transit, ship** |
|---|---|---|---|
| 0:00–0:15 | **All:** agree §4 contracts, scaffold Next.js + Phaser, A commits fake `public/days/demo/day.json` | | |
| 0:15–1:30 | One walkable scene: base map, Grid Engine, depth sort, placeholder landmarks, textbox | Highlight/landmark LLM call + Wikipedia refs + first landmark end-to-end through `pixelate.ts` | `/api/fit-check` → front sprite working; shared `pixelate.ts` with B |
| 1:30–2:30 | 3 base maps, exit tiles, scene cards, food icon in textbox | Full `/api/generate-day` → Blob; food icons | `TransitScene` bus + tube, `/day/[id]` route |
| 2:30–3:15 | Wire real `day.json`, polish 2.5D (shadows, depth) | Pre-generate demo day, lock prompts, commit to `public/days/demo/` | Deploy to Vercel, test share link in incognito |
| 3:15–4:00 | **Feature freeze. All:** README, Codex screenshots, record 90 s video, strip keys/EXIF, submit | | |

**Cut order if behind:** food icon → per-line tube colour (one generic train) → depth sort/shadows → Vercel Blob (serve only the committed demo day).

## 10. 90-second demo script

1. **0–10 s** — Problem: "My partner's in London, I'm not. I know where she is, I can't *see* her day."
2. **10–55 s** — Open her share link. Walk through scene 1 (London Eye, read a landmark textbox) → exit tile → **red bus** animation → scene 2 (ramen, food icon) → **Bakerloo line** animation → scene 3 (Regent's Park, walk stats).
3. **55–80 s** — "Now me." Take a fit-check photo → (cut the wait) → sprite appears and walks into the scene.
4. **80–90 s** — Hit **Share**, show the link. "Every day becomes a place you can visit." (World journal = one-line vision.)

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
