# DayQuest London 2.5D

Three playable pixel scenes for the day in SPEC.md (Westminster → bus 24 → Kanada-Ya → Central + Bakerloo → Regent's Park), plus the Shadwell prototype as a bonus scene. Vanilla JS + canvas, no 3D library. Every image is generated with Codex's built-in `image_gen` on Shawn's ChatGPT login, in the same style as `../shadwell-25d`.

Play: `python3 -m http.server 8766` here and open http://localhost:8766/, or open `dist/index.html` (single file, everything inlined).

## Layout

```
engine/engine.js, engine/style.css   shared engine (don't put scene logic here)
index.html                           loads the engine, then every scenes/<slug>/scene.js
shared/                              assets used by several scenes (+ jobs.py / prompts.md for the ones generated here)
scenes/<slug>/                       one folder per place: reference.md, jobs.py, prompts.md, scene.js, assets/, assets/raw/, logs/, screenshot.png
tools/                               gen.sh, process.py, prompts_md.py, shot.sh, build.py
```

## Pipeline (per folder)

1. Write prompt bodies in `<dir>/jobs.py` (`JOBS`), plus how to process each one (`SPRITES`, `TILES`). The style prefix and endings come from `tools/style.py`, which imports them from `../shadwell-25d/tools/jobs.py`, so every scene matches.
2. `tools/gen.sh <dir> <name>` runs one Codex `image_gen` call and saves `<dir>/assets/raw/<name>.png` (skips if it exists; delete or rename the raw to redo it). `REF=<png>` attaches a reference image.
3. `python3 tools/process.py <dir> [names…]` keys out the magenta, removes stray specks, crops, downscales to the game's pixel grid, limits the palette and optionally adds a 1px outline.
4. `python3 tools/prompts_md.py <dir>` writes `<dir>/prompts.md` with every `image_gen` call for that folder, copied verbatim from the Codex session records.

## Scale (keep scenes consistent)

1 tile = 32px. Shawn is 46px tall. A door is ~40px. A 2-storey shop ~150px tall, the Shadwell station 187px, a 5-storey block 232px. Landmarks can be stylised taller (a tower ~300–420px) but never smaller than these. Small props: bollard 24, bin 32, bench 32, phone box 58, lamp 78.

## Scene API

A scene file calls `DQ.scene({...})`:

| field | meaning |
|---|---|
| `id` | scene id (also the folder slug unless `dir` is set) |
| `dir` | asset folder under scenes/ when it differs from `id`, e.g. an interior scene living in its street scene's folder |
| `hidden` | true for scenes only reachable through a door (left out of the picker) |
| `title`, `time`, `card`, `order` | picker label, time chip, the banner shown on entry (e.g. `10:30 · WESTMINSTER`), position in the day (omit `order` for bonus scenes) |
| `cols`, `rows` | map size in 32px tiles |
| `walkTop` | world y the player can't go above (default 0) |
| `sky` | background colour behind backdrops / empty ground |
| `spawn` | `{x, y, dir}` in world px (feet position) |
| `own` | asset names that live in `scenes/<id>/assets/`; everything else in `assets` is loaded from `shared/assets/` |
| `assets` | every asset name the scene uses (tiles and sprites) |
| `ground(c, r)` | tile name, or `{tile, flipY, solid, ox, oy}`, or null for sky. `solid` tiles block walking (water). Tiles larger than 32px cover several cells; `ox/oy` align them |
| `build(w)` | place things with the builder below |
| `transit` | legs played when leaving through an exit: `{mode: "bus"|"tube", title, caption, color, route, destination, line, frames}` |

Builder `w`: `w.img[name]`, `w.W`, `w.H`, `w.T`, and

- `w.add(name, x, baseY, {depth, foot: [offsetX, width], solid, invented, talk, icon, shadow: "ellipse"|"base"|"none", flip, z})` places a sprite whose bottom edge sits on `baseY`. The collision box is `depth` px tall above `baseY`.
- `w.talk(x, y, text, {icon})` adds a point of interest. The player faces it and presses A.
- `w.block(x, y, w, h)` adds an invisible collision rectangle.
- `w.invented(x, y, w, h)` marks a region to outline when the "Invented" overlay is on.
- `w.door(x, y, w, h, {to, at: {x, y, dir}, label})` sets a door: stepping in switches straight to scene `to` (no transit) with the player at `at`. Leave `label` empty for an unmarked door.
- `w.exit(x, y, w, h, {label})` sets an exit: stepping in plays `transit`, then the next scene.
- `w.mover(name, {x, y, update(m, frame), invented, flip, z, shadow})` adds a sprite that moves itself (boats, swans, trains).
- `w.backdrop(name, x, y, {parallax, invented})` draws a sprite behind everything, with parallax.

## Testing

`tools/shot.sh "scene=<id>&autostart&x=..&y=..&dir=up&walk=up:60,right:20,a&invented" out.png [WxH]` takes a headless Chrome screenshot of the local server on port 8766 and prints console errors. `walk` runs scripted movement before the shot (`a` presses A, `wait:150` idles).
