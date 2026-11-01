"use client";

import { useEffect, useState } from "react";
import day from "../../data/input.json";
import RealMap from "./RealMap";

/**
 * Sample photos shown as already uploaded on the Demo page.
 * These are the restamped copies: capture time and GPS sit on the demo route.
 * The outfit photo is the original file; food and place were restamped.
 */
export const DEMO_UPLOADS = [
  { kind: "lunch", url: "/demo/food.jpg", note: "four bowls at Kanada-Ya, table 30" },
  { kind: "landmark", url: "/demo/place.jpg", note: "Big Ben from the South Bank" },
  { kind: "extra", url: "/ui/flower.png", note: "rose garden" },
  { kind: "extra", url: "/ui/heart.png", note: "best day" },
];
export const DEMO_FIT = { url: "/demo/fit.jpg", note: "red puffer, ready for London" };

/** Fetch a demo photo with its EXIF intact, so the page can read the capture time. */
export async function demoPhotoFile(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the demo photo.");
  const name = url.split("/").pop() || "photo.jpg";
  return new File([await response.blob()], name, { type: "image/jpeg" });
}

export const DEMO_SPRITE = "/days/demo/player.png";
export const DEMO_PLACES = { name: "demo", count: day.locations.length, range: "London" };

const rides = day.transport.map(leg => (leg.mode === "bus" ? `Bus ${leg.route}` : leg.line));

/** The sample route on a real map, syncing stop by stop, with how the day was travelled. */
export function DemoRoute() {
  const total = day.locations.length;
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setCount(n => Math.min(n + 1, total)), 420);
    return () => window.clearInterval(timer);
  }, [total]);
  const workout = day.workouts[0];
  return <div className="dq-demo-route">
    <RealMap stops={day.locations} count={count} />
    <div className="dq-demo-chips">
      {rides.map((ride, i) => <span key={i} className="dq-chip dq-chip-mint">{ride}</span>)}
      <span className="dq-chip dq-chip-pink">{workout.distanceKm} km · {workout.steps.toLocaleString("en-GB")} steps</span>
    </div>
  </div>;
}
