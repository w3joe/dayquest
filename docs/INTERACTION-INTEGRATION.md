# Generated interactions with a fixed asset library

The interaction layer takes completed world scenes and a shared effect catalogue. Location entry and artwork can be supplied independently. The shared production catalogue registers only steam, sparkle, heart and camera-flash effects. The photo-world planner adds the scene's own generated 32×32 `food.png` as a carryable prop when a lunch photo exists.

**Asset ownership:** the user's character, walking frames, meal, buildings and distinctive photo objects stay dynamically generated from their inputs. Interactions reuse those exact scene assets. Fixed library artwork must never replace them or act as a generation fallback. Generic terrain, street furniture, transport and identity-independent effects may be shared.

`scripts/build-interaction-art.mjs` stages these assets from `london-25d/assets/` into versioned public paths. The fixed ramen bowl and three supplied full-body Lucas action strips belong to `data/demo-interaction-catalog.json` only. Those poses match the fixed preview actor and are excluded from photo-generated characters' production catalogue. The waist-up eating/drinking rows require explicit body composition before they can be used as full-body poses. Provenance and extraction rectangles are in `scripts/interaction-art-sources.json`.

## Preparation workflow

1. Add shared effect PNGs under `public/interactions/library/` and describe them in `data/interaction-catalog.json`. Put fixed sample subjects and character poses in `data/demo-interaction-catalog.json` instead. For assets already in `london-25d/assets/`, register a deterministic copy or crop in `scripts/interaction-art-sources.json` and run `node scripts/build-interaction-art.mjs`.
2. Run `npm run assets:check`. This checks metadata, local paths, file existence, transparency and strip dimensions. Development and production builds run this check too.
3. Build the location inventory and its collision geometry as usual.
4. The interaction planner receives the scene inventory and available catalogue entries. It proposes contextual action labels, ordered steps, conditions and outcomes. It cannot introduce an asset that is absent from the catalogue.
5. The compiler validates the proposal and chooses reachable approach tiles. An invalid plan is rejected before publication.
6. Save the interaction pack in the world checkpoint before publishing the scene. Retrying publication reuses the saved plan.
7. The browser preloads assets and plays the saved sequences without model calls. Completed outcomes are stored separately from transient animation progress.

An empty catalogue produces conservative, item-specific text interactions without an API request. Once the catalogue has assets, the production planner can compose custom sequences using those capabilities. The empty catalogue does not imply that reaching, eating, sitting or other character poses are available.

This skips only the interaction-planning request; the existing live photo analysis and sprite generation still require OpenAI API access and credits. `planSceneInteractions(scene, catalog, client?)` in `pipeline/interaction-plan.ts` uses the configured `OPENAI_TEXT_MODEL` when the catalogue is nonempty. The injectable client is used for offline tests; `offlineInteractionPlan(scene, catalog?)` is the explicit deterministic preview/no-assets path. Unreachable decorative targets are omitted from that text-only fallback individually.

Production runs interaction planning as a separate `/api/world-jobs` step after all scene sprites are saved. The validated pack is stored at `checkpoint.interactionPack` before a later request publishes `day.json`; a publication retry reuses it. Development checkpoints live under ignored `.data/world-job-store/<job-id>/state.json`; Blob checkpoints use immutable `world-jobs/<job-id>/states/` entries. World job identity includes the fixed catalogue's byte fingerprint and planner format version, alongside photos, the accepted character and configured models.

## Asset delivery format

The catalogue uses schema version `1`; this is a format version, not an artwork revision. Use versioned filenames or asset IDs when replacing artwork so that new worlds receive new job IDs and existing worlds keep their visual references.

```json
{
  "version": 1,
  "assets": [
    {
      "id": "flower_held_v1",
      "src": "/interactions/library/flower-held-v1.png",
      "kind": "prop",
      "width": 16,
      "height": 24,
      "anchor": { "x": 8, "y": 20 },
      "description": "A separate flower suitable for holding in the character's hand.",
      "tags": ["flower", "held"]
    }
  ]
}
```

This flower entry illustrates a **scene-owned or demo** catalogue entry; a fixed flower cannot stand in for a distinctive photographed object. The global production catalogue accepts effects only. Add catalogue entries only when their real files exist. An empty catalogue remains supported for deployments that want text-only interactions.

- `prop`: attached to the player's hand until detached or replaced.
- `pose`: an explicitly supplied actor animation. Supply artwork compatible with the player's appearance; the system does not synthesize a personalised pose.
- `effect`: a temporary overlay used during an animation step.
- `width` and `height` are per-frame pixel dimensions. Optional `frames` and `frameMs` describe a horizontal strip. A four-frame 32×48 pose therefore needs a 128×48 PNG.
- `anchor` is an optional local point used to align the image to its attachment position. Transparent padding should be included in the frame dimensions.
- `description` and `tags` explain the asset's actual intended use to the planner. Do not describe capabilities the artwork cannot represent.

Do not change the contents of a versioned PNG in place: a catalogue fingerprint cannot detect a change to bytes that are not named differently in the catalogue.

## Location handoff

`DayScene.interactionPack` is optional. Existing worlds without it retain their current text interactions. Objects need unique stable `world.objects[].id` values. Mark a separate object `removable: true` only when its artwork may be hidden or restored by an interaction; scenery defaults to permanent. The reserved target ID `food` refers to the scene's meal, when present, and permits these visibility changes.

Food may also include optional `name` and `description` evidence from the location provider or photo inventory. Keep those factual item details separate from `food.text`, which is the personal comment shown during inspection. The generated-world pipeline preserves all three fields for contextual action planning. Older manifests with only `food.text` remain valid.

Use `compileInteractionPack(scene, proposal, catalogue)` from `lib/interactions.ts` to turn a proposal into a validated pack. A proposal contains an `actions` array; omit `approach` to let the compiler find a safe position. Keep generated instructions separate from item descriptions and supply only structured data.

```ts
const interactionPack = compileInteractionPack(scene, {
  actions: [{
    id: "read_sign",
    targetId: "cafe_board",
    label: "Read the board",
    repeatable: true,
    steps: [{ type: "say", text: "A short description grounded in the supplied item." }],
  }],
}, { version: 1, assets: [] });

const playableScene = { ...scene, interactionPack };
```

An action's ID is stable within its scene. `requires.completed` and `requires.notCompleted` refer to action IDs in that same pack. Conditions enable follow-up interactions; non-repeatable completed actions are unavailable. A scene imported with `importWorldScene` keeps its pack and resolves relative catalogue URLs against the original location manifest, just like building sprites.

## Supported sequence instructions

Approaching the item happens automatically using the game's collision-safe grid path. The sequence then runs these supported steps:

| Step | Fields | Behaviour |
| --- | --- | --- |
| `face` | `direction` | Face up, down, left or right. |
| `wait` | `durationMs` | Pause for a bounded duration. |
| `say` | `text` | Show generated text with confirmation to continue. |
| `animate` | `assetId`, `durationMs` | Play a supplied pose or effect. |
| `attach` | `assetId` | Attach a supplied prop to the character. |
| `detach` | none | Clear the carried prop. |
| `setObject` | `state` | Set the target artwork to `hidden` or `default`. |

Generated actions are compositions of these instructions. They do not contain executable code, network requests, new controls or entirely new game mechanics. A separate item sprite is needed to pick something up visually; a flower painted into a building image cannot be removed independently.

Object visibility changes do not rebuild collision geometry. Use separate small props for removable objects, and leave traversal routes clear. Travel remains owned by the journey system, rather than being duplicated as a generated action.

## Playback, cancellation and progress

Nearby actions appear in the game controls. Select an action with keyboard or touch; Escape cancels an unfinished sequence. Movement and travel are paused while the sequence owns the actor. Completion commits the action and visual outcomes together. Cancelling or refreshing before completion discards staged outcomes, so an interrupted pickup cannot duplicate or permanently remove the item.

If an item is beside a travel stop, the chooser offers both the item actions and travel. Selecting travel enters the existing boarding confirmation; selecting an item keeps the actor in the current scene. Keyboard focus remains on the sequence controls as dialogue pages change.

Completed action IDs and object states are scoped to their scene. Carried props retain their source catalogue reference across scene transitions. Restart clears interaction progress as well as journey progress. If browser storage is unavailable, exploration still works for the current session.

Both progress stores use the same [manifest content scope](GAME-PROGRESS.md). Replacing the location, route, assets or action sequence under an existing day ID starts fresh progress. Keep PNG URLs immutable and use versioned filenames when changing artwork.

## Offline preview

```sh
npm run preview:interactions
npm run dev -- --hostname 0.0.0.0
```

Open `http://localhost:3000/day/interaction-preview`. The sample ramen bowl is just to the right of the character in the first scene. Inspect it, carry it, cancel part-way through, finish the interaction, refresh, and travel by bus to check persistence. The centre building offers a photo pose; the first scene's lunch board offers wave/point poses and can put the carried bowl away. These sequences are authored fixtures with the supplied Lucas artwork; they do not claim live photo analysis or personalised production poses.

The preview combines existing transport sample worlds with the supplied props, effects and matching preview character. It makes no API calls and writes only ignored files under `public/days/`.
