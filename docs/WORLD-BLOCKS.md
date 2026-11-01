# Contextual world building blocks

Photo analysis produces a construction inventory, not independent finished scenes.
Each building and prop carries `usage` with an area, a short purpose, and optionally
an associated building ID. The allowed areas are `frontage`, `path_edge`,
`greenery`, `roadside`, `waterfront`, and `open`.

A shop sign can say that it belongs beside `building_1`, for example. Layout uses
that relationship to find a spot near that entrance on suitable ground. It does
not place the sign in whichever arbitrary prop slot happens to be next. Generic
trees remain on greenery; cars remain on road. Surface checks cover the whole
collision footprint. Entrances, spawn and exit routes remain clear. Custom
photographed subjects must be placed safely or fail explicitly, never disappear
or receive a fixed substitute.

`lib/world-kit.ts` turns that inventory into a shared kit: setting, art direction,
scale, bottom-center anchors, render dimensions, collision footprints, clearance,
ground compatibility and connection rules. Every independent image job receives
the shared context and its own contract, including neighboring architecture as
context only. It still draws just one transparent cutout. Photos remain the first
reference for observed subjects; style references supply style only. Sprite jobs
continue to run in batches of up to three.

The engine supplies continuous ground, foundation surfaces, entrance paths,
contact shadows and terrain boundaries. These must not be baked into individual
sprites. Cobble uses a continuous stone pattern in the pavement's warm palette,
rather than the legacy red brick checker texture.

The complete kit is checkpointed with the blueprint and supplied to the optional
world director. A published world also has `world-kit.json` beside `day.json`.
It describes each placed block, its source sprite, actual dimensions and
collision rectangle, placement context, and front-path connection coordinates.
The generated meal and accepted character are recorded separately in that file.
This sidecar is written before the playable manifest, so a failed kit write can
resume using the already completed sprites.

Missing usage in older inventories receives conservative defaults. Invalid new
usage is rejected. Existing published worlds keep their original sprites and
geometry; new builds use generation identity version 4 so old checkpoints cannot
mix old art jobs with the new contracts. No paid regeneration runs on refresh.

Validation: `npm test`, `npm run typecheck`, `npm run build`.
The fixture from `npx tsx scripts/preview-world.mts` is explicitly an offline sample
using existing artwork; it tests assembly without analysing photos or calling an
image service. A fresh real build is required to assess the new image prompts.
