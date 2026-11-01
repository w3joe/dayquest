"use client";

import { useEffect, useState } from "react";
import day from "../../data/input.json";
import RealMap from "./RealMap";

/** Sample photos, notes and location history shown on the Demo page. */
export const DEMO_UPLOADS = [
  { kind: "lunch", url: "/demo/food.jpg", note: "four bowls at Kanada-Ya, table 30" },
  { kind: "landmark", url: "/demo/place.jpg", note: "Big Ben from the South Bank" },
  { kind: "extra", url: "/ui/flower.png", note: "rose garden" },
  { kind: "extra", url: "/ui/heart.png", note: "best day" },
];
export const DEMO_FIT = { url: "/demo/fit.jpg", note: "red puffer, ready for London" };
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
