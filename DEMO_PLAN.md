# Hardcoded demo plan (feat/hardcoded-demo)

Goal: the core DayQuest journey plays end to end in about 2 minutes, with no generation, API keys, Blob store or network calls. Every AI step becomes a short scripted animation. The three playable places are prebuilt pixel scenes from `london-25d` (Westminster, Kanada-Ya with its interior, Regent's Park), made with Codex `image_gen` in the Shadwell style.

## Screens in order

| # | Screen | Route | What happens in the demo | Mocked |
|---|---|---|---|---|
| 1 | Today | `/` | Location history syncs onto the map (existing animation). Tap **Use the demo day** (or add any 3 photos) to fill fit, lunch and place. The character step "stitches" for ~2 s, then shows Lucas's sprite. Import Health shows the walk. Transport chips are already there. | Uploads stay in the browser (local preview only, nothing is sent). Fit check returns the prebuilt player sprite after a scripted delay. |
| 2 | Generating | `/generating` | A scripted log ticks through the real pipeline steps (finding landmarks, references, pixelating each sprite) with thumbnails of the actual prebuilt sprites and a progress bar. It takes ~8 s, then goes on to the day. | `/api/world-jobs` is never called. The events are a fixed script in `lib/demo.ts`. |
| 3 | Shared day | `/day/demo` | Title, date, Lucas's sprite, **Share this day** (copies the link). The playable world sits below, then the itinerary of 3 places. | Static manifest in `lib/demo.ts`; no Blob fetch. |
| 4 | Game (inside screen 3) | `/london-25d/index.html?scene=westminster&autostart` in an iframe | Westminster (10:30) → bus 24 transit → Kanada-Ya (12:40; walk in through the door to the interior with table 30 and the four bowls) → Central + Bakerloo transit → Regent's Park (14:15; walk stats) → end card. A scene picker is reachable from **Scenes** / Esc. | Nothing. These are the prebuilt assets, played by the vanilla canvas engine. |

## Where each scene plugs in

- `public/london-25d/` is a copy of `../openai-hack/london-25d` without `assets/raw/`, `logs/` or tools, made by `scripts/sync-london-25d.sh`:
  - `engine/` holds the shared engine.
  - `shared/assets/` holds the player sheet and the shared props.
  - `scenes/westminster/` is scene 1.
  - `scenes/kanada-ya/` is scene 2: the street plus the `kanada-ya-inside` interior.
  - `scenes/regents-park/` is scene 3.
- `lib/demo.ts` holds the demo manifest: scene titles, times, landmarks, transit legs and thumbnails. Thumbnails point at files in `public/london-25d/...`, so the generating log shows the real sprites.
- Until a scene is finished, its picker entry is simply missing, so the slots fill in as the scenes land. Rerun `scripts/sync-london-25d.sh` to pull updates.

## Code changes

- `lib/demo.ts`: `DEMO_MODE` (on for this branch), the demo sprite URL, the scripted generation events and the demo day manifest.
- `components/today/Today.tsx`: in demo mode, uploads become local previews, the fit check is a scripted delay that returns the prebuilt sprite, there's a **Use the demo day** button, and Create My World goes straight to `/generating`.
- `app/generating/page.tsx`: in demo mode, plays the scripted log, then routes to `/day/demo`.
- `app/day/demo/page.tsx`: shows the demo day viewer (`components/day/DemoDayViewer.tsx`) with the iframe game.
- The live code paths stay in place behind `DEMO_MODE`, so turning it off restores the original behaviour.

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

No `.env.local` is needed.

## Verified

Clicked through in Chrome (puppeteer driving the installed Chrome) against `npm run dev`. Screenshots of each step are in `docs/demo/`:

1. `01-today` Today screen with the location sync
2. `02`–`04` **Use the demo day**: photos fill in, the character stitches, then **Create my world** becomes available
3. `05-generating` the scripted generation log with real sprite thumbnails
4. `06-day-page` `/day/demo` with the playable world and the itinerary
5. `07`–`15` in the game: Westminster → bus 24 → Kanada-Ya street → interior → a ramen dialogue with its icon → Central → Bakerloo → Regent's Park → end card

No API routes are called. The only external requests are the app's existing Google Fonts stylesheet and fonts, which are cosmetic. `npx tsc --noEmit`, `npm test` (50/50) and `next build` all pass.
