// Hardcoded demo: every AI step is a short scripted animation over prebuilt artwork
// (public/london-25d, generated offline with Codex image_gen in the Shadwell style).
import type { GenerateEvent } from "../pipeline/types";

/** Global switch: true mocks every path (uploads, fit check, world jobs). Off on main: only the Demo
 * section's run (/generating?demo=1 → /day/demo) is scripted, so the live Try me path stays real. */
export const DEMO_MODE = false;
/** True when this page load is the Demo section's scripted run. */
export const isDemoRun = () => DEMO_MODE || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"));

const ART = "/london-25d";
const asset = (scene: string, name: string) => `${ART}/scenes/${scene}/assets/${name}.png`;

/** Prebuilt 32x48 front frame of the player sheet, returned by the scripted fit check. */
export const DEMO_SPRITE_URL = `${ART}/shared/assets/shawn_front.png`;
/** Stand-in previews for "Use the demo day" (photos never leave the browser in demo mode). */
export const DEMO_PHOTOS = {
  fit: DEMO_SPRITE_URL,
  lunch: asset("kanada-ya", "ramen_icon"),
  landmark: asset("westminster", "big_ben"),
} as const;
export const DEMO_FIT_DELAY_MS = 1800;

/** The scripted generation log, played one line at a time. */
export const DEMO_EVENTS: (GenerateEvent & { delay: number })[] = [
  { step: "highlights", label: "Reading 12 stops of location history…", delay: 500 },
  { step: "highlights", label: "Picked 3 highlights: Westminster · Kanada-Ya · Regent's Park", delay: 700 },
  { step: "landmarks", label: "Finding landmarks near Westminster: Big Ben · London Eye · Boudica", delay: 600 },
  { step: "image", label: "Drawing Elizabeth Tower", thumb: asset("westminster", "big_ben"), delay: 650 },
  { step: "image", label: "Drawing the London Eye", thumb: asset("westminster", "london_eye"), delay: 550 },
  { step: "pixelate", label: "Pixelating the Palace river front", thumb: asset("westminster", "palace"), delay: 550 },
  { step: "landmarks", label: "Finding landmarks near St Giles: Kanada-Ya · Centre Point · St Giles church", delay: 600 },
  { step: "image", label: "Drawing the Kanada-Ya shopfront", thumb: asset("kanada-ya", "kanadaya"), delay: 600 },
  { step: "image", label: "Matching your lunch photo: four bowls at table 30", thumb: asset("kanada-ya", "ramen_icon"), delay: 650 },
  { step: "landmarks", label: "Finding landmarks in Regent's Park: Jubilee Gates · Triton Fountain · boating lake", delay: 600 },
  { step: "image", label: "Drawing the Triton Fountain", thumb: asset("regents-park", "triton"), delay: 550 },
  { step: "pixelate", label: "Pixelating the bandstand and the swans", thumb: asset("regents-park", "bandstand"), delay: 550 },
  { step: "image", label: "Fitting your outfit onto a walking character", thumb: DEMO_SPRITE_URL, delay: 600 },
  { step: "done", label: "Your day is ready to visit", delay: 500 },
];

export type DemoScene = { time: string; kind: string; title: string; landmarks: string[]; thumb: string; text: string };

export const DEMO_DAY = {
  id: "demo",
  name: "Lucas",
  date: "Saturday in London",
  game: `${ART}/index.html?scene=westminster&autostart`,
  scenes: [
    { time: "10:00", kind: "tourist spot", title: "Touring Westminster", thumb: asset("westminster", "big_ben"),
      landmarks: ["Elizabeth Tower", "London Eye", "Westminster Bridge"], text: "Walked Westminster Bridge, rode the London Eye, took a photo of Big Ben." },
    { time: "12:40", kind: "meal", title: "Ramen at Kanada-Ya", thumb: asset("kanada-ya", "ramen_icon"),
      landmarks: ["Kanada-Ya", "Centre Point", "St Giles-in-the-Fields"], text: "Four bowls of ramen at table 30, St Giles High Street." },
    { time: "14:15", kind: "park", title: "Walk in Regent's Park", thumb: asset("regents-park", "triton"),
      landmarks: ["Jubilee Gates", "Triton Fountain", "Boating lake"], text: "3.8 km through Queen Mary's Gardens and round the lake." },
  ] satisfies DemoScene[],
  transit: ["Bus 24 · Parliament Square → Tottenham Court Road", "Central → Bakerloo · Tottenham Court Road → Regent's Park"],
};
