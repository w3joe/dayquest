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

The `sessionId` ties temporary uploads and the fit-check sprite to one draft. It is not an account or security token. `spriteUrl` is the successfully generated back-facing sprite, rather than the uploaded source photograph. End My Day requires completed fit-check processing and a successfully loaded 32×48 sprite image, and synchronously saves the validated draft before navigation. B should handle absent/malformed drafts with an actionable return to Today, and must not persist source photos or draft identifiers in share URLs. B maps upload kind/URL entries into its generation request, incorporates the ready sprite into the published manifest, then navigates to `/day/<id>` only after manifest and assets are published. B owns generation events and replay behavior from §6.1.

Photo replacements keep the previous committed photo and sprite until the new upload succeeds. Failed uploads offer Retry photo or Keep previous photo (Discard photo for a failed first upload). Pending changes block End My Day. A committed fit change invalidates the old sprite; generation uses the latest committed front/back pair. Failed sprite downloads offer Reload image without another generation call, or Retry character to regenerate.

`lib/draft.ts` is the browser-safe shared contract: import `DRAFT_STORAGE_KEY`, `Draft`, `ReadyDraft`, `UploadKind`, `parseStoredDraft`, `parseDraft`, and `isReadyDraft`. Restore with `parseStoredDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY))` inside a storage-access try/catch. It returns a validated draft or `null`, without throwing for malformed JSON. Validation rejects invalid UUIDv4 sessions, duplicate/unknown upload kinds, unsafe URL schemes, and sprites without a front fit. URLs must be absolute HTTP(S) without credentials/fragments, or the exact development `/api/assets/uploads/<sessionId>/<kind|player>-<uuid>.png` path. This validates structure, not image reachability or authenticity; Today also checks sprite loading before navigation. Session storage is untrusted and is never server authorization.

Incomplete drafts omit `spriteUrl` and remain restorable in Today. B must require `isReadyDraft(draft)` before starting generation, then publish the player asset with the world. Storage may be denied, so keep that access inside a try/catch and offer a return to Today. The merged `/generating` screen consumes the shared parser before calling B's `/api/generate-day` endpoint. B's live event log and recorded demo replay are preserved. B's pipeline modes default to placeholder artwork; see `docs/B-PIPELINE.md` before enabling live generation.

## Upload and character endpoints

- `POST /api/upload`: multipart `photo`, `kind`, `sessionId`; returns `{ url }` only after storage succeeds. Supported kinds are the five upload slots above. `sessionId` is a UUIDv4 created by Today.
- `POST /api/fit-check`: multipart `photo` (front), optional `backPhoto`, `sessionId`; returns `{ spriteUrl }`. Front and back together must be at most 4 MB. Produces a back-facing 32×48 PNG, preserving aspect ratio with transparent padding, binary alpha and at most 32 colours.
- JPEG, PNG and WebP only; server verifies decoded format, limits decoded pixels to 20 MP, auto-orients, strips metadata, and stores sanitised photos at up to 2048×2048. Original files are not stored. Error responses are `{ error: string }` with a non-2xx status.
- Fit check uses the pre-day `sessionId` contract in SPEC §8; B receives the returned sprite through the validated draft. Updating an existing published day's player is not implemented here and must not be assumed by A/B.
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

## Live fit-check proof

Set `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN` in ignored `.env.local`, then start `npm run dev`. Run this with a real full-body photo:

```sh
npm run prove:fit-check -- --front /absolute/path/front.jpg
# After the first successful sprite, include the optional back view:
npm run prove:fit-check -- --front /absolute/path/front.jpg --back /absolute/path/back.jpg
# The same check can target the deployed app:
npm run prove:fit-check -- --front /absolute/path/front.jpg --base-url https://your-app.vercel.app
```

Each run uploads through the real endpoints and makes one paid image-generation request after verifying photo storage. Local filesystem fallback fails the check. It downloads public Blob assets without cookies, verifies photo metadata removal and the sprite's 32×48 PNG, binary transparency and ≤32 colours, and compares a second anonymous download. Photos, sprite and a report stay under ignored `.data/fit-check-proof/<sessionId>/`. Inspect `fit.png` alongside `player.png` to confirm back-facing orientation and outfit fidelity; those visual checks remain pending in the report until reviewed. This command does not exercise the browser UI or prove complete gameplay.

After that first success, verify in the Today UI: adding a back photo regenerates the sprite; replacing the front invalidates the old sprite and disables End My Day until generation completes; a failed request displays its error and Retry character recovers with the same photos. For a controlled failure, use the browser's network tools to block `/api/fit-check`, upload a photo, then unblock it and click Retry character. Finish by checking the generated day, its images and gameplay in an incognito window after A/B integration and deployment.


## Local verification

Typecheck, all 17 tests (12 original plus five focused draft/replacement checks) and the production build pass. No new test dependencies were added. Local HTTP smoke checks cover Today, sanitised photo upload/download, rejected invalid sessions, missing image credentials, unavailable days, a temporary valid manifest loaded through the viewer, and the generating handoff page. The temporary test manifest was removed; no demo world is bundled. The new checks cover contract validation and replacement rollback helpers; browser interaction and image-load recovery still need manual verification.

On 2026-11-01, a real front fit-check photo was uploaded through the running local app to the public `dayquest-assets` Blob store in `lhr1`, linked to `tanweejoe-7327s-projects/dayquest`. An anonymous download returned the stored PNG (3,380,078 bytes), with metadata removed. The following fit-check request returned HTTP 503 with the actionable missing `OPENAI_API_KEY` error. Evidence is retained locally in ignored `.data/fit-check-proof/49945629-6ceb-4cbf-b135-b7cbcace2f70/report.json`. This proves live photo storage, not live sprite generation or storage of a generated sprite. The OpenAI key is not available; `.env.local` retains its empty placeholder. Browser automation was unavailable, and A/B code was absent from origin. Sprite orientation/outfit review, back-photo/replacement/retry UI checks, A/B integration, deployment and incognito gameplay remain unverified.

The package override pins the Blob SDK's CLI-config dependency to patched Zod 4.6.7; `npm audit` reports zero vulnerabilities with the lockfile.
