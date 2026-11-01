"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import day from "../../data/input.json";
import AppShell from "./AppShell";
import PixelSprite from "./pixel";
import RealMap from "./RealMap";

const modeLabel = (leg: (typeof day.transport)[number]) => (leg.mode === "bus" ? `Bus ${leg.route}` : leg.line);

export default function Demo() {
  const [count, setCount] = useState(0);
  const [health, setHealth] = useState<"idle" | "syncing" | "done">("idle");
  const healthTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const total = day.locations.length;
  useEffect(() => {
    const timer = window.setInterval(() => setCount(n => Math.min(n + 1, total)), 420);
    return () => { window.clearInterval(timer); if (healthTimer.current) clearTimeout(healthTimer.current); };
  }, [total]);
  const workout = day.workouts[0];
  return <AppShell active="demo">
    <section className="dq-card dq-card-mint" aria-labelledby="route-title">
      <div className="dq-card-head"><h2 id="route-title">London</h2><span className="dq-chip dq-chip-mint">{count === total ? "synced ✓" : "syncing…"}</span></div>
      <RealMap stops={day.locations} count={count} />
      <ol className="dq-stops" aria-label="Location history">{day.locations.map((stop, i) => <li key={`${stop.t}-${stop.label}`} className={i < count ? "is-synced" : undefined}><time>{stop.t}</time><span className="dq-dot" /><span>{stop.label}</span></li>)}</ol>
      <div className="dq-progress" role="progressbar" aria-label="Location sync" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}><span style={{ width: `${(count / total) * 100}%` }} /></div>
    </section>
    <div className="dq-two">
      <section className="dq-card dq-card-butter" aria-labelledby="walk-title"><div className="dq-card-head"><h2 id="walk-title">Walk</h2><PixelSprite name="heart" size={2} /></div>
        {health === "done" ? <p className="dq-walk"><strong>{workout.distanceKm} km</strong><span>{workout.durationMin} min</span><span>{workout.steps.toLocaleString("en-GB")} steps</span></p>
          : <button type="button" className="dq-pill-button" disabled={health === "syncing"} onClick={() => { setHealth("syncing"); healthTimer.current = setTimeout(() => setHealth("done"), 1500); }}>{health === "syncing" ? "Syncing…" : "Import from Health"}</button>}</section>
      <section className="dq-card dq-card-lav" aria-labelledby="ride-title"><div className="dq-card-head"><h2 id="ride-title">Transit</h2></div>
        <ul className="dq-rides">{day.transport.map((leg, i) => <li key={i}><span className={`dq-line-chip ${leg.mode === "bus" ? "is-bus" : leg.line === "Bakerloo" ? "is-bakerloo" : "is-central"}`}>{modeLabel(leg)}</span><span>{leg.from} → {leg.to}</span></li>)}</ul></section>
    </div>
    <div className="dq-cta"><Link href="/" className="dq-big-button">Try it with your photos</Link></div>
  </AppShell>;
}
