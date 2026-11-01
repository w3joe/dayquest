#!/bin/sh
# Copy the prebuilt london-25d game (engine, scenes, processed assets) into public/ for the hardcoded demo.
# Raw generations, logs, tools and prompt jobs stay in the source folder.
set -e
SRC=${1:-../openai-hack/london-25d}
DST=public/london-25d
rm -rf "$DST"
mkdir -p "$DST"
rsync -a --exclude 'raw/' --exclude 'logs/' --exclude 'tools/' --exclude 'dist/' --exclude 'screenshots/' --exclude 'qa/' --exclude 'QA.md' \
  --exclude '*.py' --exclude '__pycache__/' --exclude 'screenshot*.png' "$SRC/" "$DST/"
# 32x48 front-facing frame for the Today screen's character preview
python3 - "$DST" <<'PY'
import sys
from PIL import Image
d = sys.argv[1]
Image.open(f"{d}/shared/assets/shawn.png").crop((32, 0, 64, 48)).save(f"{d}/shared/assets/shawn_front.png")
PY
echo "synced $(find "$DST" -name '*.png' | wc -l | tr -d ' ') images into $DST"
