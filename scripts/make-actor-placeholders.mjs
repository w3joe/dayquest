// Writes one flat placeholder PNG per ACTOR_LIBRARY entry to public/tiles/dq/library/actors/<id>.png.
// Usage: node scripts/make-actor-placeholders.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "lib", "actor-library.ts");
const OUT_DIR = join(ROOT, "public", "tiles", "dq", "library", "actors");

const OUTLINE = "#1f1a2e";
const SKIN = "#f1c9a5";
const OUTLINE_WIDTH = 2;

// Matches I("id", "Name", W, H, ...) and N("id", "Name", W, H, ...) calls in the source text.
const CALL_RE = /\b(I|N)\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*(\d+)/g;

function parseActors(source) {
  const actors = [];
  for (const match of source.matchAll(CALL_RE)) {
    const [, kind, id, name, width, height] = match;
    actors.push({
      id,
      name,
      role: kind === "I" ? "interactable" : "npc",
      width: Number(width),
      height: Number(height),
    });
  }
  return actors;
}

// FNV-1a 32-bit hash so each id maps to a stable colour.
function hashId(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];
  const m = l - c / 2;
  return "#" + [r, g, b]
    .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
    .join("");
}

function paletteFor(id) {
  const h = hashId(id);
  const hue = h % 360;
  return {
    body: hslToHex(hue, 0.55, 0.55),
    light: hslToHex(hue, 0.55, 0.7),
    dark: hslToHex(hue, 0.45, 0.3),
  };
}

const f = (n) => Number(n.toFixed(2));
const rect = (x, y, w, h, fill, rx = 0) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${rx}"` : ""} fill="${fill}" stroke="${OUTLINE}" stroke-width="${OUTLINE_WIDTH}"/>`;
const ellipse = (cx, cy, rx, ry, fill) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${OUTLINE_WIDTH}"/>`;
const circle = (cx, cy, r, fill) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${OUTLINE_WIDTH}"/>`;

// Interactable: an object with a coloured cap on top and a box body beneath.
function interactableShapes(W, H, pal) {
  const capH = H * 0.3;
  return [
    rect(2, 2, W - 4, capH, pal.light, 2),
    rect(3, H * 0.3, W - 6, H - 3 - H * 0.3, pal.body, 1),
    rect(W / 2 - 3, H * 0.42, 6, Math.max(2, H * 0.08), pal.dark),
  ];
}

// NPC person: round head, body, two legs (used for tall sprites).
function personShapes(W, H, pal) {
  const headR = Math.min(W * 0.16, H * 0.14);
  const headCy = H * 0.2;
  return [
    rect(W * 0.3, H * 0.72, W * 0.15, H - 2 - H * 0.72, pal.dark),
    rect(W * 0.55, H * 0.72, W * 0.15, H - 2 - H * 0.72, pal.dark),
    rect(W * 0.25, H * 0.4, W * 0.5, H * 0.34, pal.body, 3),
    circle(W / 2, headCy, headR, SKIN),
  ];
}

// NPC animal: blob body, head with eye, tail on the left, two tiny legs.
function animalShapes(W, H, pal) {
  const headR = Math.min(H * 0.2, W * 0.14);
  const headCx = W * 0.74;
  const headCy = H * 0.42;
  // Tail endpoints are clamped so the stroke (half-width 2) stays inside the 1px margin.
  const tailCtrlX = Math.max(4, W * 0.1);
  const tailTipX = Math.max(4, W * 0.12);
  const tail = `M ${f(W * 0.22)} ${f(H * 0.58)} Q ${f(tailCtrlX)} ${f(H * 0.5)} ${f(tailTipX)} ${f(H * 0.3)}`;
  return [
    `<path d="${tail}" fill="none" stroke="${OUTLINE}" stroke-width="${OUTLINE_WIDTH + 2}" stroke-linecap="round"/>`,
    `<path d="${tail}" fill="none" stroke="${pal.body}" stroke-width="2" stroke-linecap="round"/>`,
    rect(W * 0.3, H * 0.74, 2, H - 2 - H * 0.74, pal.dark),
    rect(W * 0.6, H * 0.74, 2, H - 2 - H * 0.74, pal.dark),
    ellipse(W * 0.5, H * 0.6, W * 0.32, H * 0.22, pal.body),
    circle(headCx, headCy, headR, pal.light),
    `<circle cx="${f(headCx + headR * 0.3)}" cy="${f(headCy - headR * 0.2)}" r="1" fill="${OUTLINE}"/>`,
  ];
}

function svgFor(actor) {
  const { width: W, height: H, id, role } = actor;
  const pal = paletteFor(id);
  let shapes;
  if (role === "interactable") shapes = interactableShapes(W, H, pal);
  else if (H >= 40) shapes = personShapes(W, H, pal);
  else shapes = animalShapes(W, H, pal);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    shapes.join("") +
    `</svg>`
  );
}

async function renderPng(actor) {
  return sharp(Buffer.from(svgFor(actor)), { density: 72 })
    .png({ palette: true, colors: 24, dither: 0 })
    .toBuffer();
}

async function main() {
  const source = await readFile(SOURCE, "utf8");
  const actors = parseActors(source);
  if (actors.length === 0) throw new Error(`no I(...) or N(...) entries found in ${SOURCE}`);

  const seen = new Set();
  for (const actor of actors) {
    if (seen.has(actor.id)) throw new Error(`duplicate actor id: ${actor.id}`);
    seen.add(actor.id);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const written = [];
  for (const actor of actors) {
    const file = join(OUT_DIR, `${actor.id}.png`);
    await writeFile(file, await renderPng(actor));
    written.push({ file, actor });
  }

  const problems = [];
  for (const { file, actor } of written) {
    const meta = await sharp(file).metadata();
    if (meta.format !== "png" || meta.width !== actor.width || meta.height !== actor.height) {
      problems.push(
        `${file}: expected png ${actor.width}x${actor.height}, got ${meta.format} ${meta.width}x${meta.height}`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`wrote ${written.length} placeholders`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
