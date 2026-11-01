# DayQuest (working name)

**See your partner's day, not just hear about it.** DayQuest turns a day of location history, photos, workouts and an outfit fit check into three playable, retro pixel-art scenes (inspired by GBA-era top-down RPGs) that you share with one link. Between scenes, a pixel animation shows the real London transport taken: red bus, tube line and all.

> Built in 4 hours at the OpenAI hackathon. Full design: [SPEC.md](SPEC.md).

## Try it

- **Live app:** _TODO: Vercel link_ → start at `/` to create a day, or open a shared `/day/<id>` link
- Arrow keys to walk · Space to read / advance · walk onto the path at the edge of the map to travel to the next highlight

## What we built today

- _TODO: fill in at feature freeze_
- Pipeline: day data → LLM picks 3 highlights (tourist spot, meal, park) + nearby landmarks → reference photos → `gpt-image-2.5` → pixel post-process → `day.json`
- Game: Shadwell-style Canvas 2D scenes with manifest-driven landmarks, depth sorting, textboxes and keyboard/touch controls
- Today screen: location history sync, photo uploads (fit check, lunch), health import, transport detection
- Fit check → back-facing player sprite
- Transport loading animations (bus / tube line)
- Shareable `/day/<id>` links

## Use of Codex

_TODO: one concrete example — prompt, what Codex produced, screenshot of the diff._

## Setup

Run checks in GitHub manually, then deploy using your existing Vercel login with `npm run deploy:vercel`. See [deployment instructions](docs/DEPLOYMENT.md). Pushes do not trigger deployments. The assigned production address is `https://dayquest-pi.vercel.app`.

```bash
git clone https://github.com/w3joe/dayquest.git
cd dayquest
npm install
cp .env.example .env.local   # add OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN
npm run dev                  # http://localhost:3000
```

### Integration status

The integration branch connects Today, fit-check, B’s generation stream and the playable three-chapter viewer using Shadwell’s Canvas 2D implementation approach. The demo page and generation replay have been removed. Run `npm run typecheck`, `npm test`, and `npm run build` to check it.

- The Today screen animates the template location history, pixelates photo previews, matches EXIF times to stops, and displays the fixture health/transport data. Health import and location sync are demo animations, not integrations with a device.
- JPEG, PNG and WebP uploads are limited to 4 MB each. Uploads are decoded, oriented and stripped of metadata on the server. Without Blob credentials, development uploads are stored in ignored `.data/` and served by `/api/assets/`; production requires Blob.
- Fit-check generation needs `OPENAI_API_KEY`. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-flare`. Missing credentials return an error; a preview thumbnail is never presented as a generated character.
- `BLOB_BASE_URL` is the public Blob store base URL for generated `days/<id>/day.json` manifests. Unavailable days show a readable recovery page; the retired demo route shows a not-found page.
- `/generating` validates the draft and streams B’s generation events. The viewer uses Shadwell’s rendering approach with shared map layouts, sprite depth sorting, small collision footprints, food icons, bus/tube transitions and an end-card Share action. See [integration status](docs/INTEGRATION-STATUS.md) for verified behavior and remaining gates.

The retained internal demo fixtures use placeholder landmark/player artwork and are not exposed as a playable demo page. They are not evidence of live generation. To deploy after A/B integration, import the repository into Vercel, set the server environment variables from `.env.example`, connect a public Blob store, and check uploads, character generation and a shared day in a fresh browser. Do not commit uploaded personal photos or `.env.local`.

The connected generation route is B’s implementation: `POST /api/generate-day` reads `data/input.json` and uploaded photos, streams progress, and publishes the manifest.

## Team

| Name | Role |
|---|---|
| _TODO_ | Game + transit animations |
| _TODO_ | Pipeline + generating log |
| _TODO_ | Today screen (ingest), character, deploy |

Contact: _TODO_

## Credits

- Ground textures and trees: existing generated Shadwell artwork in this repository. Static water/transit sprites retain A’s integration assets.
- Rendering/art approach: the original Canvas 2D `shadwell-25d` prototype in this repository; shared style in `shadwell-25d/assets/style.json`.
- Landmark reference images: Wikipedia / Wikimedia Commons

### Art and local preview

`npm run dev` and `npm run build` first run `scripts/build-game-art.mjs`, deriving game textures from Shadwell’s processed artwork. The offline Shadwell prompt jobs and live image API share one style prefix. Internal demo fixtures remain available for development checks.

For other-device development use `npm run dev -- --hostname 0.0.0.0` and add the device-facing hostname/IP to `DAYQUEST_DEV_ORIGINS` (no scheme or port). Live worlds need `PIPELINE_IMAGES=live`, optionally `PIPELINE_TEXT=live`, an OpenAI API key and the Blob settings from `.env.example`. Mock pipeline modes are explicitly labelled as placeholder artwork.

### Photo-to-world flow

The main page's **Today's fit**, **Lunch break**, and **Somewhere special** photos now lead to one explorable neighbourhood when you select **Create My World**. The accepted fit-check character supplies the reference for a directional walking sheet. The location photo supplies a scene inventory and three building sprites, while the lunch photo supplies a food pickup. Shared Shadwell ground textures and street furniture complete the layout, with collision and depth sorting. Location-history and health demo data are not evidence for this scene.

This flow uses live OpenAI calls and requires `OPENAI_API_KEY`, available API credits, and access to the configured `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL`. It does not use the legacy `/api/generate-day` mock-mode switches. Exhausted credits or a failed sprite produce an actionable retry message; they never silently replace your artwork with placeholders. Production also requires the Blob settings in `.env.example`.

`POST /api/world-jobs` accepts the ready main-page draft and returns progress immediately. Repeated requests advance one bounded step at a time: photo analysis, a batch of up to three independent sprites generated in parallel, or final publication. Each successful sprite is saved and checkpointed as it completes, including when another sprite in its batch fails; retry with the same draft plus `retry: true` to continue from the remaining assets. The job identity includes the photo uploads, accepted character, session, and configured models, so completed sprites are reused for the same inputs. Refreshing the generation page resumes that job rather than starting its finished assets again. A changed photo or model creates a new job.

For an **offline renderer preview using existing sample artwork**, run:

```bash
npx tsx scripts/preview-world.mts
```

Then visit `http://localhost:3000/day/world-preview` with the development server running. The preview uses existing Shadwell buildings and character frames plus a demo lunch icon, labels them as sample artwork, and writes only ignored `public/days/world-preview/` files. It makes no paid API calls and does not demonstrate photo analysis or live generation.

### Connected locations and transport

The transport layer accepts completed location scenes and explicit journeys independently of the location-entry implementation. [Transport integration](docs/TRANSPORT-INTEGRATION.md) defines scene IDs, departure/arrival points, route legs and the `composeWorldItinerary` handoff. Existing single-location worlds remain supported.

Run `npm run preview:transport`, then open `http://localhost:3000/day/transport-preview` while the development server is running. This offline fixture has four sample locations linked by bus, a Tube journey with a line change, and a walk. Walk to the departure point and use Space/Enter or the touch action button to confirm boarding. Travel can be skipped to arrival, and refreshing resumes at a safe scene checkpoint. Only the last location has a finish/share exit.

Bus-stop and station sprites are pre-generated and shared across journeys. Builds validate the committed PNGs locally; runtime travel never calls an image service. Exact ImageGen prompts are recorded in `scripts/transport-art-prompts.json`.

### Generated item interactions

World scenes can carry contextual action sequences composed from shared generic effects and their own dynamically generated assets. Characters, buildings, meals and distinctive photo objects retain their generated artwork; fixed food and character poses are confined to offline samples. Live pickup uses the scene's generated meal sprite. [Interaction integration](docs/INTERACTION-INTEGRATION.md) describes asset delivery, scene handoff, sequence instructions and saved outcomes. Run `npm run assets:check` when adding artwork.

Run `npm run preview:interactions` and visit `http://localhost:3000/day/interaction-preview` with the development server running. This offline fixture uses supplied artwork to demonstrate choosing actions, approaching an item, temporary effects, Lucas's photo/wave/point poses, carrying a prop, cancellation and progress across travel. It makes no API calls.
