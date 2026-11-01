# C integration handoff

`SPEC.md` remains the source of truth. C owns Today, photo uploads, fit-check generation, the shared viewer shell, and deployment preparation. A owns Phaser gameplay and transport; B owns the pipeline, `/generating`, `/api/generate-day`, and generated/demo manifests and artwork.

## Today → B's generating screen

Before navigating to `/generating`, Today writes this JSON to `sessionStorage["dayquest:draft"]`:

```ts
{
  sessionId: string;
  uploads: Array<{
    kind: "fit" | "fit_back" | "lunch" | "landmark" | "park";
    url: string;
  }>;
  spriteUrl: string;
}
```

The `sessionId` ties temporary uploads and the fit-check sprite to one draft. It is not an account or security token. `spriteUrl` is the successfully generated back-facing sprite, rather than the uploaded source photograph. End My Day requires completed fit-check processing. B should handle absent/malformed drafts with an actionable return to Today, and must not persist source photos or draft identifiers in share URLs. B maps upload kind/URL entries into its generation request, incorporates the ready sprite into the published manifest, then navigates to `/day/<id>` only after manifest and assets are published. B owns generation events and replay behavior from §6.1.

## Upload and character endpoints

- `POST /api/upload`: multipart `photo`, `kind`, `sessionId`; returns `{ url }` only after storage succeeds. Supported kinds are the five upload slots above. `sessionId` is a UUIDv4 created by Today.
- `POST /api/fit-check`: multipart `photo` (front), optional `backPhoto`, `sessionId`; returns `{ spriteUrl }`. Front and back together must be at most 4 MB. Produces a back-facing 32×48 PNG, preserving aspect ratio with transparent padding, binary alpha and at most 32 colours.
- JPEG, PNG and WebP only; server verifies decoded format, limits decoded pixels to 20 MP, auto-orients, strips metadata, and stores sanitised photos at up to 2048×2048. Original files are not stored. Error responses are `{ error: string }` with a non-2xx status.
- The spec's route summary lists `dayId` for fit check, while its Today flow generates the player before a day exists. This implementation supports that pre-day flow through `sessionId`; B receives the returned sprite through the draft. Updating an existing published day's player is not implemented here and must not be assumed by A/B.
- Development without Blob writes to ignored `.data/assets/`; local URLs are served through `/api/assets/`. Production requires Blob and does not expose local files. Missing OpenAI configuration returns 503; there is no generated-character stand-in.

## B → shared viewer

- Demo: commit the actual manifest and artwork under `public/days/demo/`. C reads `day.json` from disk at request time; it does not invent a playable fallback when the files are absent.
- Generated day: configure server-side `BLOB_BASE_URL` to the public Blob store origin (or its common path prefix). C fetches exactly `<BLOB_BASE_URL>/days/<id>/day.json`; B must publish at that stable path, disabling randomized pathname suffixes for this object. IDs allow letters, numbers, underscores, and hyphens, up to 64 characters.
- B follows §4.2: 3 ordered scenes (tourist, meal, park), three landmarks with unique slots 0–2 per scene, 2 transit transitions, and a player sprite. Tile coordinates fit the 20×15 map. Relative asset paths resolve against the manifest URL. Shared asset URLs must stay public and valid without the creating browser session.
- The viewer validates manifest structure, checks the returned ID, and renders a readable unavailable state on missing, partial, or malformed output. It does not redirect a failed generated day to the demo.
- `BLOB_BASE_URL` is a public URL held in server configuration; it is not the write token. Blob credentials remain server-side.

## C → A's game mount

`components/day/GameMount.tsx` exports `GameMount` and `GameMountProps`:

```ts
type GameMountProps = { manifest: DayManifest; manifestUrl: string };
```

`DayManifest` and the relative asset resolver live in `lib/day.ts`; that module contains no Node-only imports and can be consumed by A's client module. `manifestUrl` is `/days/demo/day.json` locally and an absolute HTTPS Blob URL for generated worlds. Use `resolveDayAsset(spritePath, manifestUrl)` for each asset.

A should replace the current pending-state component body with a client-only Phaser mount after its actual module exists. Import Phaser only on the client, mount to an owned DOM ref, and destroy the Phaser instance when unmounting or changing manifest. Preserve 320×240 logical resolution, integer/pixelated scaling, keyboard interaction, textbox/food behavior, sequential transit, and final share action from the spec. No dummy scene is currently presented as playable.

The surrounding viewer shows the real manifest's player preview and chapter titles, handles failed player images, and exposes Share. Clipboard failures reveal a selectable URL for manual copying. A can reuse the viewer's share action at the game end or add the specified end-card button using `location.href`.

## Acceptance gates

1. Missing demo files and missing `BLOB_BASE_URL` render an honest unavailable state.
2. A valid demo manifest loads locally without OpenAI or Blob credentials.
3. Generated manifests and all relative images load from a newly opened, signed-out browser.
4. Clipboard success reports copied; denied/unavailable clipboard exposes a selectable URL.
5. After A connects the mount, verify all 3 scenes, textboxes, transport legs, end card, and cleanup after route navigation. Until then, the shell explicitly says game integration is pending.

Deployment and full gameplay verification remain separate gates from a successful build.


## Local verification

Typecheck, all 12 tests and the production build pass. Local HTTP smoke checks cover Today, sanitised photo upload/download, rejected invalid sessions, missing image credentials, unavailable days, a temporary valid manifest loaded through the viewer, and the generating handoff page. The temporary test manifest was removed; no demo world is bundled. Live OpenAI generation, public Blob persistence, browser interaction/visual QA and deployment are unverified.

The package override pins the Blob SDK's CLI-config dependency to patched Zod 4.6.7; `npm audit` reports zero vulnerabilities with the lockfile.
