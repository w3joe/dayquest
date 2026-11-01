# DayQuest: ideas and improvements

Working notes from a brainstorm, not a spec. Where they disagree, `SPEC.md` wins.

## The shape we are designing for

| | |
|---|---|
| **Tone** | Cosy and sentimental: a postcard from someone you miss, not a game to beat. Warm palette, gentle sound, small personal notes. |
| **Audience** | Close friends and family, sent into a group chat. Not public or social, so no discovery or moderation to build. |
| **Device** | Phone first. Most links are opened from a messaging app on a phone. Desktop keyboard play is the bonus. |

Everything below is judged against those three. If an idea fights them (leaderboards, public feeds, desktop-only controls), it is parked.

## At a glance

Effort: S under 2 h, M half a day, L a day or more. Impact is for the shape above.

| # | Idea | Impact | Effort | Where it lands |
|---|---|---|---|---|
| 1 | Link preview card | High | M | `app/day/[id]` metadata + `opengraph-image` route |
| 2 | Phone controls and full-screen layout | High | M | `game/` input, `GameMount`, `day.module.css` |
| 3 | Land in the world | High | S | `DayViewer` layout |
| 5 | Note from the sender | High | S | `day.json` field + Today input + end card |
| 6 | Reactions | High | L | new storage + `/api/react` + game overlay |
| 7 | Sound | Medium | M | `game/` audio, assets |
| 8 | Guided first visit | Medium | M | `HighlightScene` auto-walk |
| 9 | Review before generating | High | M | new screen between Today and `/generating` |
| 14 | Fuzzy locations | High | S | ingest output + manifest |
| 23 | Cache landmark art by place | Medium | M | pipeline (B) |
| A | Weather-aware scenes | High | M | ingest (Open-Meteo) + `HighlightScene` grade/particles |
| B | Demo location package with recorded lookups | High | M | `data/demo-package`, `Lookups` replay, Today |
| C | Scripted video clip of the day | Medium | M | scripted input into `HighlightScene`, canvas `MediaRecorder` |
| D | Three interactables per scene (Agents SDK ideas) | High | L | manifest field, `HighlightScene`, agent + validator |

## Sketches for the top items

**1. Link preview card.** Next supports an `opengraph-image` file route per segment. Render a 1200×630 image server-side with `sharp`: tile background from `public/tiles/dq`, the day's player sprite and its first landmark scaled up with nearest-neighbour, then the title text. Add `generateMetadata` on `/day/[id]` so the title reads "Lucas's day in London" and the description is the three scene names. Cache by day ID. Check with a real messaging app, since each one crops and caches differently.

**2. Phone controls.** Grid Engine already moves a character from direction calls, so a touch d-pad is a set of buttons that call the same `move` as the arrow keys (hold = repeat). Add a large action button that triggers the existing interact. In `GameMount`, use a full-viewport container on small screens and `touch-action: none` on the canvas. The integer zoom picker in `game/main.ts` should also react to resize and orientation change instead of reading width once. Test on a real phone over the Tailscale address.

**3. Land in the world.** Move the intro block below the game on `/day/[id]`, make the game the first thing on screen, and add a "Tap to start" overlay that also unlocks audio. Keep the share button in a slim top bar.

**5. Note from the sender.** Add an optional `note` string to the manifest (and C's validator), an input on Today, and show it as the first textbox when the game starts and again on the end card.

**9. Review before generating.** After `/api/ingest` returns `candidates`, show each of the three highlights with its top alternatives and a rename field, plus the guessed-route flags. The confirmed choice is what goes to generation. This is also the natural home for the "what was guessed" labels.

## Decisions so far

- **Sound:** background music and sound effects, no narration or speech. Sources are in-code synthesis (Web Audio) and CC0 royalty-free loops. OpenAI has no music or SFX endpoint (its audio API is speech and transcription), so generated sound would need a third party. **No Nintendo music or effects**: they are copyrighted recordings, the spec forbids them, and this repo is public. A git-ignored local folder can hold anyone's personal files without committing them.
- **Frontend:** polish the existing screens rather than rebuild them, starting with the shared-day page. Warm, cosy, phone-first.
- **Link preview card:** parked, to revisit later.
- **Weather-aware scenes** and the **demo location package** (see "Two additions"): wanted.

## More ideas from the team

### C. A short video clip of the day, played by a script

A shared day can also carry a short clip of the character walking through it, so someone can watch without playing.

- **Scripted playback.** Instead of recording a human, a script drives the character: it walks a planned route to each landmark, pauses to show its textbox, takes the exit and plays transit. The same movement code as normal play, fed by a script of directions rather than the keyboard. This also makes the guided first visit (idea 8) almost free.
- **Turning it into a video.** Capture the Phaser canvas with `MediaRecorder` (browser-side, no server) to a short WebM or MP4, or keep it as a live "auto-play" mode that needs no file at all. Sora is out of scope in the spec, and none is needed here since this is the game running.
- **Where it shows up.** An "Watch the day" button on the share page and a looping preview, and the clip can double as the link preview animation later.
- **Care needed.** Keep it short (20 to 40 seconds), skip transit by default, respect the music mute, and make it deterministic so every view looks the same.

### D. Three interactables per environment

Each scene should include three things to *do*, such as a button to press, a lever, a bell, a bench to sit on, a lamp to switch on, in addition to reading landmark text.

- **Idea generation with the Agents SDK.** An agent receives the day (the place, landmarks, weather, time of day, what the person did there) and proposes three interactables suited to that scene, each with a name, a tile position that does not block the route, a sprite description, an action, and a line of text. A validator checks positions, uniqueness and reachability, and a safe set of defaults is used if the agent fails, so the demo never depends on it.
- **Examples.** Westminster: press a crossing button that makes the lights change; ring a bell on the bridge. Ramen street: pull a noren curtain, press a vending-machine button, pet a street cat. Regent's Park: sit on a bench, feed the swans, switch on a lamp near dusk.
- **Feel.** Each interaction has a small animation, a sound effect, and a short warm line. Weather and time of day can change them (a lamp only lights at dusk; no swans in a storm).
- **Contract.** `day.json` gains an `interactables` array per scene (3 items). Sprites come from the same generation and pixelate pipeline as landmarks, or from a small fixed set of icons for reliability.

## Two additions

### A. Weather-aware scenes

Each scene should look like the weather it was lived in. That is cosy, personal, and cheap to do in a 2D game.

- **Data.** Open-Meteo needs no API key and covers past days and forecasts. One call per scene (location + hour) returns temperature, cloud cover, precipitation, a weather code and `is_day`; one more gives sunrise and sunset. Ingest attaches a `weather` object to each stop and highlight, and the manifest carries a small `weather` field per scene (`condition`, `tempC`, `daylight`), not raw API output.
- **Condition set.** Keep it small so each one is designed rather than generated: `clear`, `cloudy`, `rain`, `drizzle`, `snow`, `fog`, `storm`. Map the weather code to one of these in a single table.
- **Look.** A colour grade over the whole scene (cool grey for overcast, warm for golden hour), rain or snow particles, softer or longer shadows by sun height, puddle-dark ground in rain, and a lamp glow once `is_day` is false. Phaser can do all of this with a tint, a particle emitter and a camera overlay, with no new art.
- **Time of day.** Use the scene time against sunset: the demo park walk at about 15:30 sits near sunset (16:23 on 7 Nov), so it should warm up. Transit scenes can follow the same grade (tube stays dark regardless).
- **Textbox touch.** One optional line of weather in the scene card, such as "10:00 · TOURING WESTMINSTER · 7°C OVERCAST".
- **Failure mode.** If the weather call fails, the scene renders neutral and the manifest omits `weather`. Never block generation on it.
- **Cost.** Free, fast, cacheable by place and hour.

### B. A fake "location package" that follows our route

The problem it solves: the live ingest guessed wrong places for the demo (a Caffè Nero for Kanada-Ya, a different bus than route 24) because the fixture coordinates were rough and the lookups are best-effort. A demo that *looks* like it ingests a real day has to understand where we actually went, every time.

The idea is one self-contained **demo package**, in the same formats a phone would export, plus a recording of what the lookups would return:

```
data/demo-package/
  timeline.json        Google Timeline: visits and movements at the real coordinates of each place
  health-export.xml    the walk (distance, duration, steps) matching the route
  route.gpx            the actual walking line through the park, point by point
  photos/*.jpg         EXIF time and GPS at each stop
  weather.json         the weather for that day and hours, recorded
  lookups.recorded.json  recorded responses for place, landmark, transit and label lookups, keyed by request
  manifest.json        what the package claims: date, timezone, expected stops, expected legs
```

How it works end to end:
1. **Precise coordinates.** Each stop uses the verified location of the real place (Elizabeth Tower, London Eye, Kanada-Ya at 64 St Giles High St, Queen Mary's Gardens, and so on). Bus 24 and the Central and Bakerloo legs follow real stop and station positions, so the route reads as a real journey.
2. **Names in the Timeline.** Include place names in the legacy `placeVisit` format where realistic, so the label never depends on a guess.
3. **Recorded lookups.** `scripts/record-lookups.mts` runs the live OSM, Wikipedia, TfL and weather calls once and saves the responses. A `replayLookups` implementation of the existing `Lookups` interface serves them back, so the package ingests identically with no network and no rate limits, on stage or in CI.
4. **One switch.** `INGEST_MODE=live | replay`. Replay is the default for the demo. Live mode still works for real uploads.
5. **Same code path.** Replay goes through the real parsers and assembler, not a shortcut, so the demo day is genuinely produced by the platform. A test asserts the package reproduces the committed demo stops, legs, walk stats and photo matches, and fails if a lookup is missing.
6. **Today screen link.** "Use the demo package" on Today loads these files into the real import flow, so what the audience sees animating is the actual parse.
7. **Honesty.** Mark it clearly as a synthetic demo package in the UI and in the repo, so nobody mistakes it for private data.

Open points: pin the exact coordinates by checking each against OSM; decide whether the demo weather is the real 7 Nov forecast (mild, overcast, no rain) or a scripted rainy afternoon to show the effect off.

## Priorities

### Do first: the link is the product

1. **Link preview card.** Right now a shared URL is a bare link. Generate a pixel-art Open Graph image: the character in front of the day's best landmark, with "LUCAS'S DAY · London · Sat 7 Nov". This is what people see in iMessage/WhatsApp before they tap, so it sets the tone before the game loads. Needs `og:image` meta on `/day/[id]` and a small image route.
2. **Phone controls.** On-screen d-pad and one action button, large tap targets, the game filling the screen in portrait and landscape. Without this most recipients cannot play at all. Also: pinch-zoom disabled on the canvas, and no scroll hijack while playing.
3. **Land in the world, not the header.** Opening the link should show "Tap to start" with the character already standing in scene 1. The "Create your day" pitch belongs after the end card, not before play.
4. **Load fast on mobile data.** Show a cosy loading screen (the character walking in place) and preload the next scene's art while the current one plays. Total payload per day should stay small, since sprites are tiny already.

### Do next: make it feel personal

5. **A note from the sender.** One optional line at the top ("saw you'd love this one") and an optional sign-off on the end card. It costs almost nothing and does most of the emotional work.
6. **Reactions, not comments.** Recipients can tap a heart or a small emoji on a landmark, and the sender sees who reacted to what. Keep it to a handful of fixed reactions, no free text, no accounts (name entered once, remembered locally).
7. **Sound, kept soft.** Footsteps, a text blip, one calm loop per scene, a short sting between scenes. Muted by default on mobile until the first tap, with an obvious mute button. Optional later: the sender's voice reading a textbox line using the audio API.
8. **Guided first visit.** Auto-walk to each landmark with a "let me explore" skip, then hand over control. Show a small "2 of 3 found" counter so exploring feels gently directed, with no failure state.

### Making a day (the sender's side)

9. **Review before generating.** Show the picked highlights and landmarks and let the sender swap or rename. Live place matching guessed wrong during testing (a Caffè Nero instead of the restaurant), so a quick confirm step is what makes the result trustworthy.
10. **Explain the exports.** The hard part is getting a Timeline or Health file off a phone. A short illustrated "how to export" per source, and wording that says plainly what is read and what is kept.
11. **Photo-first mode.** For people with no exports, build a day from 5 to 10 photos. EXIF time and GPS give most of what is needed.
12. **Say what was guessed.** Mark inferred things (like the bus route, which Timeline does not record) as guesses in the review step rather than presenting them as fact.
13. **Wire the Today import buttons to `/api/ingest`.** They still animate bundled demo data.

### Privacy and trust (matters more for family)

14. **Fuzzy locations.** A toggle to snap landmarks to generic place names and drop exact coordinates from the published day. Home and work should never appear.
15. **Delete my day.** One tap, and an optional expiry ("link works for 30 days").
16. **Unlisted by default.** Unguessable IDs (already in the spec), no indexing, `noindex` on `/day/*`.

### Polish and delight (cosy touches)

17. **Weather and time of day.** A warm dusk palette for evening scenes, rain overlay if it rained, from real data where available.
18. **Small life in the world.** A pigeon, a boat on the river, a dog walker. A handful of looping ambient sprites per base map.
19. **Idle character animation** and a short wave when a recipient first arrives.
20. **Photo mode.** A button that saves a clean scene screenshot with a small frame, for sharing back into the chat.
21. **Gentle transit.** Let viewers skip transit and replay it, and show real stop names (already done).
22. **Accessibility.** Reduced-motion setting, larger-text option, a "read this day as text" page, and keyboard and screen-reader access to textbox content.

### Reliability and cost

23. **Cache landmark art by place.** A second visit to Big Ben should not re-generate it. Faster, cheaper, and visually consistent across days.
24. **Clear failure states.** If generation is slow or fails, keep the uploads and offer retry rather than starting over.
25. **Generated-art quality gate.** Reject sprites with a messy alpha edge or wrong size before they reach `day.json`, and fall back to a simple placeholder landmark instead of a broken scene.

## Parked

- Public profile pages, feeds, discovery, comments with free text.
- Leaderboards, collectibles, battle-style mechanics.
- A native app. The web link is the product.
- Real-time live location. Different product, different privacy story.

## Open questions

- Should reactions be visible to other recipients in a group, or only to the sender?
- Is a recipient allowed to reply with their own day (a "send one back" button)? It fits the cosy long-distance idea, and it is the natural growth loop.
- How long should a link live by default?
