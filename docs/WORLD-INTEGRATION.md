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
- Every Place, Food, Park and extra photo becomes its own explorable scene, in
  upload order. Fit photos stay with the character. A food photo is a meal
  scene: place research looks up the restaurant and builds that shopfront when
  a real venue can be verified. Consecutive scenes are joined by a walk.
- Replacement uploads preserve the committed fit until the new upload succeeds.
  Removed or superseded gallery uploads cannot repopulate the draft.
- Uploaded location history currently has a local preview only. The main page
  explicitly says it is not used for world creation yet.

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

The production path uses the **Cloud Agents API** by default (`WORLD_DESIGN_AGENTS=live`):
each specialist (place researcher, brief, composer, designer, critic, tuner) gets its
own OpenAI-hosted sandbox session, writes `/workspace/outputs/result.json`, and the
session is deleted afterwards. Set `WORLD_DESIGN_AGENTS=sdk` for the older in-process
Agents SDK (no VM), or `template` / `off` for deterministic template design. Design
mode is included in the world job identity; failed research/design falls back
without replacing photographed subjects.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Asset staging in prebuild
uses local committed files only. Do not run the live image-generation scripts as
part of integration verification.
