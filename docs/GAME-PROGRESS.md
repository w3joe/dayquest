# Saved progress and published revisions

Journey and interaction progress share one content revision scope, produced by `dayProgressScope(manifest)` in `lib/game-progress.ts`. The game computes it once at startup and passes it to both storage-key helpers. Refreshing an unchanged manifest preserves progress. Changing scene layout, artwork URLs, catalogue metadata, action sequences, route data or scene ordering starts fresh progress even when the public day ID and local scene/action IDs are reused.

The scope canonicalizes JSON object keys; rearranging equivalent object properties does not reset a day. Array order remains meaningful. Optional properties omitted by JSON serialization remain equivalent to an absent property. Its versioned 64-bit checksum is a browser-local revision marker, not a security token. It requires no Node APIs or secure context, including on development devices using plain HTTP.

The runtime does not migrate old ID-only storage keys: those records have no trustworthy content revision. Older manifests without interactions or keyed transport remain supported.

Publish artwork at immutable, versioned URLs. Replacing image bytes at the same URL leaves the manifest content unchanged, so a browser cannot distinguish the new artwork or invalidate saved progress reliably. Give changed assets a new filename or URL version, then republish the manifest. Keep scene/action IDs stable when their meaning is stable; a changed manifest still receives a new progress scope automatically. Preserve the originating scene ID on carried props when composing imported scenes so their catalogue artwork resolves correctly after travel.
