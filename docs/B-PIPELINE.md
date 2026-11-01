# B pipeline handoff

`SPEC.md` §5, §6.1 and §8 are the source of truth. This is how B's framework is wired.

## Modes (nothing spends credits by default)

| Env | `mock` (default) | `live` |
|---|---|---|
| `PIPELINE_TEXT` | §2.1 template plan built from `data/input.json` | One Responses API call with structured output (`OPENAI_TEXT_MODEL`, default `gpt-5.4-mini`); falls back to the template on any error |
| `PIPELINE_IMAGES` | Deterministic placeholder silhouettes drawn with sharp | `images.edit` with Wikipedia + user photo references (`OPENAI_IMAGE_MODEL`); a failed sprite falls back to a placeholder and the log says `(PLACEHOLDER)` |

Live modes also need `OPENAI_API_KEY`.

## Files

- `pipeline/highlights.ts`: prompt, JSON schema, `normalizePlan` (forces tourist/meal/park order, base maps and slots 0–2), `templatePlan`.
- `pipeline/references.ts`: Wikipedia lead image, which only follows `upload.wikimedia.org` and returns null on any failure.
- `pipeline/imagegen.ts`: `STYLE_PREFIX`, prompt builders, live and mock generators, and `mapLimit` (6 concurrent).
- `pipeline/pixelate.ts`: fixed §5.4 sizes (S/M/L/food/foodIcon/player), bottom-centre anchor, binary alpha, ≤32 colours.
- `pipeline/layout.ts`: **spawn / exit / food tiles per base map (A: change them here)**, plus TfL colours and transport → 2 transitions.
- `pipeline/publish.ts`: Blob store at `days/<id>/…` when `BLOB_READ_WRITE_TOKEN` and `BLOB_BASE_URL` are set; otherwise `public/days/<id>/` in dev. `loadStoredAsset` only reads `/api/assets/…`, `public/`, or our Blob host.
- `pipeline/generate.ts`: `runGenerateDay(opts, emit)` runs the whole pipeline and emits §6.1 events.
- `app/api/generate-day/route.ts`: `POST { uploads, spriteUrl }` → NDJSON stream. The last event is `{ step: "done", id }` or `{ step: "error" }`.
- `app/generating/page.tsx`: live log from the Today draft. Navigates to `/day/<id>` when done. Retired replay links return to Today without starting generation.

## Manifest addition

`scene.food.icon` is the 32×32 textbox icon. `food.sprite` stays the 16×16 table sprite. `icon` is optional in `lib/day.ts`, so A should fall back to `sprite`.

## Internal demo fixtures

```bash
npm run demo:generate                      # placeholder demo (committed now)
PIPELINE_TEXT=live PIPELINE_IMAGES=live npm run demo:generate -- --player sprite.png --lunch ramen.jpg --landmark eye.jpg --park park.jpg
```

The demo page and replay are retired. This development command wipes and rewrites `public/days/demo/` (`day.json`, PNGs and `events.ndjson` with real timings). Photos are re-encoded, so EXIF never reaches the repo. To hand-tune art instead, overwrite the PNGs in `public/days/demo/` at the same sizes and keep `day.json`.

In dev without Blob, `/day/<id>` reads `public/days/<id>/day.json` (gitignored), so a full Today → Generating → Day run works locally.
