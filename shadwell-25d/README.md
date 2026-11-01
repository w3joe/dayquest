# Shadwell — from two photos (2.5D)

A small top-down pixel-art street scene outside Shadwell Overground station. Built with vanilla JS and canvas, with no 3D library. Every image was generated with ChatGPT image generation, through the Codex CLI's built-in `image_gen` tool.

- Play: `python3 -m http.server` in this folder, then open http://localhost:8000/. Or open `dist/index.html` directly: it's one self-contained file with every asset inlined.
- Controls: arrows/WASD to move, Shift to run, Space/Enter/Z to talk, I to toggle the "invented" outlines. On touch screens there's an on-screen D-pad and an A button.
- URL options: `?autostart` skips the title card, `?x=…&y=…` sets the start position, `?invented` turns the outlines on.

## Pipeline

1. `tools/jobs.py` holds the prompt set: one shared style prefix plus a prompt per asset. `tools/gen.sh NAME` runs `codex exec` and asks it to call `image_gen` once, then copies the result into `assets/raw/`.
2. `tools/process.py` keys out the magenta background, crops, downscales to the game's pixel grid, hard-thresholds alpha and limits the palette. It also slices the walk sheet into 32×48 frames (`assets/shawn.png`: rows down/left/right/up, plus a 5th row with the thumbs-up).
3. `tools/build.py` inlines CSS, JS and base64 PNGs into `dist/index.html`.

The "invented" overlay follows the street photo. It outlines what the photo doesn't show: the whole far side of the road (pavement lamps, verge, flower beds, trees, hedges, terraced shops), the viaduct and train, and the car parked on the far side. The station-side cycle stands, bins, parked car, tree, lamps, bollards, flats and yellow house are all in the photo.
