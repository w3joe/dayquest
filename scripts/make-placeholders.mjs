// Draws flat placeholder sprites at the exact §5.4 pixel sizes so the game can be built before B's pipeline exists.
// Output goes through the same palette/alpha rules as pipeline/pixelate.ts. Run: node scripts/make-placeholders.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const DAY = "public/days/demo";
const TRANSIT = "public/transit";
await mkdir(DAY, { recursive: true });
await mkdir(TRANSIT, { recursive: true });

const OUT = "#1f1a2e";
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${body}</svg>`;
const rect = (x, y, w, h, fill, stroke = OUT) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const windows = (x, y, cols, rows, gap, fill = "#ffe9a8") =>
  Array.from({ length: cols * rows }, (_, i) => `<rect x="${x + (i % cols) * gap}" y="${y + Math.floor(i / cols) * gap}" width="4" height="5" fill="${fill}"/>`).join("");

async function save(file, w, h, body) {
  await sharp(Buffer.from(svg(w, h, body))).png({ palette: true, colors: 32, dither: 0 }).toFile(file);
}

const sprites = {
  // Landmarks: S=48x48, M=64x64, L=80x64
  "s0_l0.png": [80, 64, rect(4, 6, 24, 54, "#d9c28b") + rect(8, 0, 16, 10, "#a38b4e") + rect(14, 14, 4, 4, "#fff") + rect(30, 26, 46, 34, "#c9b27a") + windows(36, 32, 6, 3, 7)], // Elizabeth Tower + Parliament
  "s0_l1.png": [80, 64, `<circle cx="40" cy="30" r="27" fill="none" stroke="${OUT}" stroke-width="7"/><circle cx="40" cy="30" r="27" fill="none" stroke="#e9eef2" stroke-width="3"/><circle cx="40" cy="30" r="5" fill="#e9eef2" stroke="${OUT}" stroke-width="2"/>` + rect(30, 56, 20, 6, "#6f7f8f")], // London Eye
  "s0_l2.png": [48, 48, rect(14, 6, 20, 38, "#d3202a") + rect(18, 10, 12, 8, "#bfe2f2") + rect(18, 22, 12, 8, "#bfe2f2") + rect(18, 34, 12, 8, "#bfe2f2") + rect(12, 2, 24, 6, "#a8181f")], // phone box
  "s1_l0.png": [64, 64, rect(4, 18, 56, 44, "#222a38") + rect(2, 10, 60, 12, "#d3202a") + rect(10, 28, 16, 28, "#f2e2b8") + rect(34, 30, 20, 16, "#f2e2b8") + `<rect x="8" y="14" width="48" height="4" fill="#fff"/>`], // Kanada-Ya
  "s1_l1.png": [80, 64, rect(26, 2, 28, 58, "#8d97a6") + windows(32, 8, 4, 6, 6, "#d6ecff") + rect(20, 52, 40, 10, "#6a7280")], // Centre Point
  "s1_l2.png": [48, 48, rect(6, 14, 36, 30, "#6a4a8a") + rect(4, 8, 40, 8, "#8e2a3a") + rect(14, 24, 8, 20, "#e8d8f0") + rect(26, 24, 12, 10, "#e8d8f0")], // noren side shop
  "s2_l0.png": [64, 64, rect(4, 24, 8, 38, "#c9c1ad") + rect(52, 24, 8, 38, "#c9c1ad") + rect(2, 18, 14, 8, "#a69e8a") + rect(48, 18, 14, 8, "#a69e8a") + rect(12, 30, 40, 4, "#2a2a30") + `<circle cx="32" cy="44" r="8" fill="#e56a8a" stroke="${OUT}" stroke-width="2"/>`], // rose garden gates
  "s2_l1.png": [64, 64, rect(18, 46, 28, 14, "#8f9aa6") + rect(26, 28, 12, 20, "#b9a35a") + `<circle cx="32" cy="22" r="8" fill="#b9a35a" stroke="${OUT}" stroke-width="2"/>` + rect(10, 56, 44, 6, "#6f7f8f")], // Triton Fountain
  "s2_l2.png": [80, 64, rect(4, 40, 72, 20, "#2a8fd0") + rect(24, 14, 32, 28, "#e8e0cc") + `<polygon points="20,16 40,2 60,16" fill="#a8353f" stroke="${OUT}" stroke-width="2"/>` + `<ellipse cx="14" cy="50" rx="6" ry="4" fill="#fff"/><ellipse cx="66" cy="52" rx="6" ry="4" fill="#fff"/>`], // bandstand + swans
  "s1_food.png": [16, 16, `<ellipse cx="8" cy="9" rx="7" ry="5" fill="#f4efe0" stroke="${OUT}" stroke-width="1"/><ellipse cx="8" cy="8" rx="5" ry="3" fill="#d89b4a"/><rect x="5" y="5" width="2" height="2" fill="#7ab05a"/><rect x="9" y="6" width="2" height="2" fill="#f4efe0"/>`],
  // Back-facing player 32x48 (replaced by the fit-check sprite in real runs)
  "player.png": [32, 48, rect(8, 4, 16, 14, "#4a3426") + rect(6, 18, 20, 16, "#2f6fb0") + rect(4, 20, 4, 12, "#2f6fb0") + rect(24, 20, 4, 12, "#2f6fb0") + rect(9, 34, 6, 12, "#2a2f3c") + rect(17, 34, 6, 12, "#2a2f3c")],
  // Scene 1 parallax skyline backdrop (The Shard + city blocks), 320x64
  "skyline.png": [320, 64, rect(0, 40, 36, 24, "#8da0b4") + rect(40, 32, 28, 32, "#7c90a6") + `<polygon points="120,64 134,2 148,64" fill="#a9bccd" stroke="${OUT}" stroke-width="2"/>` + rect(160, 36, 40, 28, "#8da0b4") + rect(210, 28, 30, 36, "#7c90a6") + rect(250, 38, 70, 26, "#8da0b4")],
};
for (const [file, [w, h, body]] of Object.entries(sprites)) await save(`${DAY}/${file}`, w, h, body);

// Static transit art (SPEC §7). Train is white so the scene can tint it per TfL line.
await save(`${TRANSIT}/bus.png`, 96, 48, rect(2, 4, 92, 34, "#d3202a") + rect(2, 20, 92, 3, "#8e1019") + windows(8, 8, 8, 1, 11, "#bfe2f2").replace(/height="5"/g, 'height="8"') +
  Array.from({ length: 7 }, (_, i) => rect(8 + i * 12, 26, 9, 8, "#bfe2f2")).join("") + rect(64, 8, 26, 10, "#111") + `<circle cx="22" cy="40" r="6" fill="#222" stroke="${OUT}" stroke-width="2"/><circle cx="72" cy="40" r="6" fill="#222" stroke="${OUT}" stroke-width="2"/>`);
await save(`${TRANSIT}/tube.png`, 112, 40, rect(2, 6, 108, 28, "#ffffff") + rect(2, 22, 108, 5, "#cfd4da") + Array.from({ length: 5 }, (_, i) => rect(8 + i * 21, 11, 14, 9, "#6f8ba3")).join("") + `<circle cx="22" cy="35" r="4" fill="#222"/><circle cx="90" cy="35" r="4" fill="#222"/>`);
await save(`${TRANSIT}/city.png`, 320, 96, rect(0, 40, 50, 56, "#7a8ea6") + windows(8, 48, 5, 5, 8) + rect(54, 24, 40, 72, "#6b7f98") + windows(60, 32, 4, 7, 9) + rect(100, 52, 60, 44, "#8da0b4") + windows(108, 60, 6, 3, 8) +
  rect(168, 14, 30, 82, "#6b7f98") + windows(174, 22, 4, 8, 7) + rect(204, 46, 52, 50, "#7a8ea6") + windows(212, 54, 5, 4, 8) + rect(262, 30, 58, 66, "#6b7f98") + windows(270, 38, 6, 5, 8));
await save(`${TRANSIT}/nelson.png`, 40, 96, rect(10, 54, 20, 40, "#b9b09a") + rect(14, 6, 12, 50, "#c9c1ad") + rect(12, 0, 16, 8, "#9a927e") + rect(6, 88, 28, 8, "#9a927e"));

console.log("placeholders written");
