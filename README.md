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
npm run dev                  # http://localhost:3000/day/demo
```

Regenerate the demo day: `POST /api/generate-day` (reads `data/input.json`).

## Team

| Name | Role |
|---|---|
| _TODO_ | Game (Phaser scenes) |
| _TODO_ | Pipeline (LLM + image gen) |
| _TODO_ | Character, transit animations, deploy |

Contact: _TODO_

## Credits

- Tiles: [Puny World](https://opengameart.org/content/16x16-puny-world-tileset) (CC0)
- Engine: [Phaser 3](https://phaser.io), [Grid Engine](https://github.com/Annoraaq/grid-engine) (Apache-2.0)
- Landmark reference images: Wikipedia / Wikimedia Commons
