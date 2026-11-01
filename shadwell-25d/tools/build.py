"""Bundle index.html + style.css + game.js + assets/*.png into dist/index.html."""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

html = (ROOT / "index.html").read_text()
css = (ROOT / "style.css").read_text()
js = (ROOT / "game.js").read_text()
names = re.search(r"const ASSETS = \[(.*?)\];", js, re.S).group(1)
names = re.findall(r'"([a-z_]+)"', names)
data = {n: "data:image/png;base64," + base64.b64encode((ROOT / "assets" / f"{n}.png").read_bytes()).decode() for n in names}

html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}</style>")
html = html.replace('<script src="game.js"></script>',
                    f"<script>window.ASSET_DATA = {json.dumps(data)};</script>\n<script>\n{js}</script>")
out = ROOT / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, f"{out.stat().st_size / 1024:.0f} KB")
