# Frontend and world-design integration

The pastel upload frontend (`reworked-frontend`) and world composition work
(`world-design`) share the durable `/api/world-jobs` pipeline. The main page starts
empty; `/demo` is explicitly a sample and cannot submit its demo artwork as a real
draft. The legacy demo-driven `/api/generate-day` stream returns HTTP 410 with
an instruction to use `/api/world-jobs`; offline sample tools remain available.

## Photo handoff

- One front fit photo drives the accepted character and its walking frames.
- Food, Place and More accept multiple photos with per-photo notes, up to twelve
  per group and thirty photos in the complete draft including Fit.
- Every submitted photo and note reaches planning. The first Place and Food
  photos anchor the single representative location and featured meal. Supporting
  photos provide context; they do not imply visits, additional stops or routes.
- Replacement uploads preserve the committed fit until the new upload succeeds.
  Removed or superseded gallery uploads cannot repopulate the draft.
- Uploaded location history currently has a local preview only. The main page
  explicitly says it is not used for world creation yet. The itinerary helpers
  and multi-scene import/transport contracts remain available for future wiring.

## World composition and interactions

Street, garden, plaza and riverside templates supply the walkable foundation.
World designs add supporting characters, props, dialogue and cosmetic effects.
Generated interaction packs remain the primary interaction system and keep their
atomic saved outcomes and scene-specific revision scope. Supporting objects can
use the bounded cosmetic fallback when they have no generated action.

Photographed buildings, distinctive objects, food and the player's character
retain their dynamic generation path and source references. Generic terrain,
street furniture, transport and supporting NPCs may use shared artwork. Shared
production interaction assets contain effects only; food pickup binds to the
scene's generated `food.png`.

The normal production path uses deterministic template design. The optional
multi-agent place research and design pipeline requires the server setting
`WORLD_DESIGN_AGENTS=live`. Its design mode is included in the world job identity;
failed research/design falls back without replacing photographed subjects.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Asset staging in prebuild
uses local committed files only. Do not run the live image-generation scripts as
part of integration verification.
