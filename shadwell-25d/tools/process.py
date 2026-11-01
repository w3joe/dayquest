"""Turn raw generations in assets/raw/ into game-ready pixel PNGs in assets/.

Steps per sprite: key out magenta -> crop to content -> area-downscale to the
target pixel size -> hard alpha -> limit palette (no dither) -> optional 1px
outline. Tiles are cropped square and downscaled to 32x32.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets"
OUTLINE = (34, 28, 40, 255)

# name: (target height or None, target width or None, palette colours, add outline)
SPRITES = {
    "station": (None, 352, 48, False),
    "flats": (232, None, 32, False),
    "yellow_house": (156, None, 32, False),
    "shop_corner": (150, None, 32, False),
    "shop_cafe": (150, None, 32, False),
    "shop_laundry": (150, None, 32, False),
    "viaduct": (None, 512, 24, False),
    "train": (None, 300, 24, False),
    "lamp": (76, None, 16, True),
    "bollard": (22, None, 8, True),
    "cycle_stand": (None, 30, 8, True),
    "aboard": (30, None, 12, True),
    "tree": (84, None, 16, True),
    "hedge": (None, 64, 12, True),
    "bin_grey": (30, None, 10, True),
    "bin_purple": (30, None, 10, True),
    "car_red": (None, 76, 16, True),
    "car_blue": (None, 76, 16, True),
}
TILES = ["tile_paving", "tile_brick", "tile_asphalt", "tile_kerb", "tile_grass", "tile_flowers"]
# textures with small detail keep a 2x2-cell texture so they survive the downscale
BIG_TILES = {"tile_flowers": 64, "tile_grass": 64}
FRAME_W, FRAME_H, CHAR_H = 32, 48, 46


def key_magenta(img):
    """RGBA with magenta-ish background made transparent (and its fringe despilled)."""
    a = np.asarray(img.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # distance from pure magenta, plus a "pinkness" test for the anti-aliased fringe
    bg = (r > 170) & (b > 170) & (g < 110) & (np.abs(r - b) < 70)
    fringe = (r - g > 90) & (b - g > 90) & (np.abs(r - b) < 60)
    alpha = np.where(bg | fringe, 0, a[..., 3])
    # if the generator already gave real transparency, keep it
    alpha = np.minimum(alpha, a[..., 3])
    a[..., 3] = alpha
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def crop_alpha(img, pad=0):
    bbox = img.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def downscale(img, w, h):
    # premultiplied area average, then hard alpha
    small = img.convert("RGBa").resize((w, h), Image.BOX).convert("RGBA")
    a = np.asarray(small).copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a, "RGBA")


def limit_palette(img, colours):
    a = np.asarray(img).copy()
    rgb = Image.fromarray(a[..., :3], "RGB")
    q = rgb.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    a[..., :3] = np.asarray(q)
    return Image.fromarray(a, "RGBA")


def add_outline(img):
    a = np.asarray(img).copy()
    solid = a[..., 3] > 0
    grown = solid.copy()
    grown[1:, :] |= solid[:-1, :]
    grown[:-1, :] |= solid[1:, :]
    grown[:, 1:] |= solid[:, :-1]
    grown[:, :-1] |= solid[:, 1:]
    edge = grown & ~solid
    a[edge] = OUTLINE
    return Image.fromarray(a, "RGBA")


# the generator painted the tree trunk green; recolour everything below the crown
TRUNKS = {"tree": 0.76}
BARK = [(74, 46, 30), (110, 70, 42), (146, 98, 60)]


def brown_trunk(img, from_frac):
    a = np.asarray(img).copy()
    y0 = int(a.shape[0] * from_frac)
    part = a[y0:]
    rgb = part[..., :3].astype(int)
    lum = rgb.mean(-1)
    target = (part[..., 3] > 0) & ~np.all(part == OUTLINE, -1) & (rgb[..., 1] > rgb[..., 0])
    # the crown's lowest leaves hang either side of the trunk top; only take the middle there
    w = a.shape[1]
    top = int(a.shape[0] * 0.04)
    target[:top, : int(w * 0.40)] = False
    target[:top, int(w * 0.60):] = False
    for i, (lo, hi) in enumerate([(0, 60), (60, 110), (110, 256)]):
        part[target & (lum >= lo) & (lum < hi), :3] = BARK[i]
    a[y0:] = part
    return Image.fromarray(a, "RGBA")


def fit(img, h, w, pad):
    if h:
        w = max(1, round(img.width * h / img.height))
    else:
        h = max(1, round(img.height * w / img.width))
    out = downscale(img, w, h)
    if pad:
        canvas = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
        canvas.paste(out, (1, 1))
        out = canvas
    return out


def process_sprite(name, h, w, colours, outline):
    img = crop_alpha(key_magenta(Image.open(RAW / f"{name}.png")))
    out = limit_palette(fit(img, h, w, outline), colours)
    if outline:
        out = add_outline(out)
    if name in TRUNKS:
        out = brown_trunk(out, TRUNKS[name])
    out.save(OUT / f"{name}.png")
    return out.size


def process_tile(name):
    img = Image.open(RAW / f"{name}.png").convert("RGB")
    s = min(img.size)
    # trim a hair off the edges in case the generator drew a border
    m = s // 64
    img = img.crop((m, m, s - m, s - m))
    size = BIG_TILES.get(name, 32)
    out = img.resize((size, size), Image.BOX)
    out = out.quantize(colors=16, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    if name == "tile_kerb":
        out = restore_lines(img, out)
    out.save(OUT / f"{name}.png")
    return out.size


def restore_lines(raw, small):
    """Thin painted lines vanish when averaged down; find them in the raw tile and stamp them back 1px tall."""
    a = np.asarray(raw).astype(int)
    yellow = (a[..., 0] > 190) & (a[..., 1] > 150) & (a[..., 2] < 90)
    rows = np.where(yellow.mean(1) > 0.5)[0]
    if not len(rows):
        return small
    colour = tuple(int(v) for v in a[yellow].mean(0)) + (255,)
    out = np.asarray(small).copy()
    prev = -2
    for y0, y1 in segments([r in set(rows) for r in range(a.shape[0])], 2, 1):
        # keep at least one row of tarmac between the two lines
        y = max(prev + 2, int((y0 + y1) / 2 * 32 / a.shape[0]))
        if prev >= 0:
            out[prev + 1:y] = out[min(31, y + 3)]  # tarmac between the lines
        out[min(31, y), :] = colour
        prev = y
    return Image.fromarray(out, "RGBA")


def segments(profile, min_gap, min_len):
    """Runs of True in a 1D boolean profile, merging gaps shorter than min_gap."""
    runs, start = [], None
    for i, v in enumerate(list(profile) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append([start, i])
            start = None
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= min_len]


def frames_from_sheet(img, rows, cols):
    alpha = np.asarray(img.getchannel("A")) > 128
    H, W = alpha.shape
    row_runs = segments(alpha.sum(1) > 2, 4, H // 20)
    row_runs = sorted(sorted(row_runs, key=lambda r: r[1] - r[0], reverse=True)[:rows])
    frames = []
    for y0, y1 in row_runs:
        band = alpha[y0:y1]
        col_runs = segments(band.sum(0) > 1, W // 80, W // 30)
        col_runs = sorted(sorted(col_runs, key=lambda r: r[1] - r[0], reverse=True)[:cols])
        frames.append([crop_alpha(img.crop((x0, y0, x1, y1))) for x0, x1 in col_runs])
    return frames


def place(frame, scale):
    w, h = max(1, round(frame.width * scale)), max(1, round(frame.height * scale))
    # the generator's own pixel grid is coarse, so nearest-neighbour keeps faces crisp
    small = frame.convert("RGBa").resize((w, h), Image.NEAREST).convert("RGBA")
    small = limit_palette(small, 32)
    cell = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    cell.alpha_composite(small, ((FRAME_W - small.width) // 2, FRAME_H - small.height - 1))
    return cell


def add_outline_safe(img):
    canvas = Image.new("RGBA", (img.width + 2, img.height + 2), (0, 0, 0, 0))
    canvas.paste(img, (1, 1))
    return add_outline(canvas)


def process_player():
    sheet = key_magenta(Image.open(RAW / "shawn_walk.png"))
    rows = frames_from_sheet(sheet, 4, 3)
    tallest = max(f.height for row in rows for f in row)
    widest = max(f.width for row in rows for f in row)
    scale = min(CHAR_H / tallest, FRAME_W / widest)
    out = Image.new("RGBA", (FRAME_W * 3, FRAME_H * 5), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, f in enumerate(row):
            out.alpha_composite(place(f, scale), (c * FRAME_W, r * FRAME_H))
    thumbs_raw = RAW / "shawn_thumbs.png"
    if thumbs_raw.exists():
        t = crop_alpha(key_magenta(Image.open(thumbs_raw)))
        # match the walk frames' on-screen height
        t_scale = min(CHAR_H / t.height, FRAME_W / t.width)
        out.alpha_composite(place(t, t_scale), (0, 4 * FRAME_H))
    out.save(OUT / "shawn.png")
    return [len(r) for r in rows]


def main():
    only = set(sys.argv[1:])
    sizes = {}
    for name, spec in SPRITES.items():
        if (not only or name in only) and (RAW / f"{name}.png").exists():
            sizes[name] = process_sprite(name, *spec)
    for name in TILES:
        if (not only or name in only) and (RAW / f"{name}.png").exists():
            sizes[name] = process_tile(name)
    if (not only or "shawn" in only) and (RAW / "shawn_walk.png").exists():
        sizes["shawn"] = process_player()
    print(json.dumps(sizes))


if __name__ == "__main__":
    main()
