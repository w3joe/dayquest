# DayQuest (working name)

**See your partner's day, not just hear about it.** DayQuest turns a day of location history, photos, workouts and an outfit fit check into three playable, retro pixel-art scenes (inspired by GBA-era top-down RPGs) that you share with one link. Between scenes, a pixel animation shows the real London transport taken: red bus, tube line and all.

> Built in 4 hours at the OpenAI hackathon. Full design: [SPEC.md](SPEC.md).

## Try it

- **Live app:** _TODO: Vercel link_ → open `/day/demo`
- Arrow keys to walk · Space to read / advance · walk onto the path at the edge of the map to travel to the next highlight

## What we built today

- _TODO: fill in at feature freeze_
- Pipeline: day data → LLM picks 3 highlights (tourist spot, meal, park) + nearby landmarks → reference photos → `gpt-image-2.5` → pixel post-process → `day.json`
- Game: Phaser 3 + Grid Engine scenes with AI-generated landmarks, depth sorting, textboxes
- Today screen: location history sync, photo uploads (fit check, lunch), health import, transport detection
- Fit check → back-facing player sprite
- Transport loading animations (bus / tube line)
- Shareable `/day/<id>` links

## Use of Codex

_TODO: one concrete example — prompt, what Codex produced, screenshot of the diff._

## Setup

```bash
git clone https://github.com/w3joe/openai-hack.git
cd openai-hack
npm install
cp .env.example .env.local   # add OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN
npm run dev                  # http://localhost:3000
```

### C implementation status

This branch implements the Today screen, photo uploads, fit-check character API and day viewer shell. Run `npm run typecheck`, `npm test`, and `npm run build` to check it.

- The Today screen animates the template location history, pixelates photo previews, matches EXIF times to stops, and displays the fixture health/transport data. Health import and location sync are demo animations, not integrations with a device.
- JPEG, PNG and WebP uploads are limited to 4 MB each. Uploads are decoded, oriented and stripped of metadata on the server. Without Blob credentials, development uploads are stored in ignored `.data/` and served by `/api/assets/`; production requires Blob.
- Fit-check generation needs `OPENAI_API_KEY`. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-flare`. Missing credentials return an error; a preview thumbnail is never presented as a generated character.
- `BLOB_BASE_URL` is the public Blob store base URL for generated `days/<id>/day.json` manifests. `/day/demo` reads `public/days/demo/day.json` once A/B supply the demo; unavailable days show a readable recovery page.
- A's Phaser scenes and B's generation endpoint/log/demo assets are not included in C's work. `/generating` is an explicit integration boundary, not a simulated successful generation. See [C integration notes](docs/C-INTEGRATION.md) for handoff contracts.

The branch does not include a hosted deployment or a generated demo day. To deploy after A/B integration, import the repository into Vercel, set the server environment variables from `.env.example`, connect a public Blob store, and check uploads, character generation and a shared day in a fresh browser. Do not commit uploaded personal photos or `.env.local`.

The complete generation route remains B's integration: `POST /api/generate-day` reads `data/input.json` and uploaded photos, streams progress, and publishes the manifest.

## Team

| Name | Role |
|---|---|
| _TODO_ | Game + transit animations |
| _TODO_ | Pipeline + generating log |
| _TODO_ | Today screen (ingest), character, deploy |

Contact: _TODO_

## Credits

- Tiles: [Puny World](https://opengameart.org/content/16x16-puny-world-tileset) (CC0)
- Engine: [Phaser 3](https://phaser.io), [Grid Engine](https://github.com/Annoraaq/grid-engine) (Apache-2.0)
- Landmark reference images: Wikipedia / Wikimedia Commons
