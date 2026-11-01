import PixelSprite from "./pixel";

type Stop = { lat: number; lng: number; label: string };

const ZOOM = 14;
const TILE = 256;
const WORLD = TILE * 2 ** ZOOM;
const project = (lat: number, lng: number) => ({
  x: ((lng + 180) / 360) * WORLD,
  y: ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * WORLD,
});

/** Real OpenStreetMap tiles, softened to pastel, with the day's route and a walking sprite on top. */
export default function RealMap({ stops, count }: { stops: Stop[]; count: number }) {
  const pts = stops.map(stop => project(stop.lat, stop.lng));
  const pad = 70;
  const x0 = Math.min(...pts.map(p => p.x)) - pad, x1 = Math.max(...pts.map(p => p.x)) + pad;
  const y0 = Math.min(...pts.map(p => p.y)) - pad, y1 = Math.max(...pts.map(p => p.y)) + pad;
  const w = x1 - x0, h = y1 - y0;
  const tiles: { x: number; y: number }[] = [];
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) tiles.push({ x: tx, y: ty });
  const shown = pts.slice(0, count);
  const here = shown.at(-1);
  const line = shown.map(p => `${p.x - x0},${p.y - y0}`).join(" ");
  return <div className="dq-realmap" style={{ aspectRatio: `${w} / ${h}` }}>
    <svg viewBox={`0 0 ${w} ${h}`} className="dq-map-tiles" aria-hidden="true">{tiles.map(t => <image key={`${t.x}-${t.y}`} href={`https://tile.openstreetmap.org/${ZOOM}/${t.x}/${t.y}.png`} x={t.x * TILE - x0} y={t.y * TILE - y0} width={TILE} height={TILE} />)}</svg>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Map of the day's route through London">
      {shown.length > 1 && <><polyline points={line} fill="none" stroke="#fffdf8" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /><polyline points={line} fill="none" stroke="#ff8fae" strokeWidth="5" strokeDasharray="1 11" strokeLinecap="round" strokeLinejoin="round" /></>}
      {shown.map((p, i) => <g key={i}><rect x={p.x - x0 - 8} y={p.y - y0 - 8} width="16" height="16" rx="5" fill="#fffdf8" stroke="#5b4a5f" strokeWidth="3" /><rect x={p.x - x0 - 3.5} y={p.y - y0 - 3.5} width="7" height="7" rx="2" fill={i === shown.length - 1 ? "#ff8fae" : "#7fc4a0"} /></g>)}
    </svg>
    {here && <span className="dq-walker" style={{ left: `${((here.x - x0) / w) * 100}%`, top: `${((here.y - y0) / h) * 100}%` }}><PixelSprite name="face" size={2.5} /></span>}
    <span className="dq-map-credit">© OpenStreetMap</span>
  </div>;
}
