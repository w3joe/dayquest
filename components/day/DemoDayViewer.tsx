"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEMO_DAY, DEMO_SPRITE_URL } from "@/lib/demo";
import styles from "./day.module.css";

const box = { background: "#fbf7ec", color: "#221c28", border: "4px solid #221c28", boxShadow: "inset 0 0 0 4px #e3d9bd, 6px 6px 0 rgba(0,0,0,.45)", padding: "18px 22px", width: "min(420px, calc(100vw - 32px))", textAlign: "center" as const, font: "700 13px monospace" };
const btn = { background: "#fff", color: "#221c28", border: "3px solid #221c28", padding: "6px 12px", font: "700 12px monospace", cursor: "pointer", boxShadow: "3px 3px 0 rgba(0,0,0,.25)" };

/** Demo-only "share as video clip": a short render bar, then a looping preview of the day's places. Calls nothing. */
function ClipShare() {
  const [state, setState] = useState<"idle" | "rendering" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [frame, setFrame] = useState(0);
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (state === "rendering") {
      const t0 = performance.now();
      const timer = setInterval(() => {
        const p = Math.min(1, (performance.now() - t0) / 2000);
        setProgress(p);
        if (p >= 1) { clearInterval(timer); setState("ready"); }
      }, 50);
      return () => clearInterval(timer);
    }
    if (state === "ready") {
      const timer = setInterval(() => setFrame((f) => (f + 1) % DEMO_DAY.scenes.length), 900);
      return () => clearInterval(timer);
    }
  }, [state]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 1400); return () => clearTimeout(t); }, [toast]);
  const scene = DEMO_DAY.scenes[frame];
  return <>
    <button type="button" className={styles.share} onClick={() => { setProgress(0); setFrame(0); setState("rendering"); }}>SHARE AS VIDEO CLIP ▶</button>
    {state !== "idle" && <div role="dialog" aria-label="Share as video clip" style={{ position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(16,14,22,.7)" }}>
      <div style={box}>
        {state === "rendering" ? <><p>RENDERING YOUR DAY…</p><div style={{ height: 12, border: "3px solid #221c28", background: "#fff" }}><span style={{ display: "block", height: "100%", width: `${progress * 100}%`, background: "#d8342c" }} /></div></> : <>
          <div style={{ aspectRatio: "3 / 2", border: "3px solid #221c28", background: "#a9d4f5", display: "grid", placeItems: "center", position: "relative" }}>
            <img src={scene.thumb} alt={scene.title} style={{ maxHeight: "80%", maxWidth: "80%", imageRendering: "pixelated" }} />
            <span style={{ position: "absolute", left: 8, bottom: 6, background: "#221c28", color: "#ffd23f", padding: "2px 6px", fontSize: 11 }}>{scene.time} · {scene.title.toUpperCase()}</span>
          </div>
          <p>{DEMO_DAY.name.toLowerCase()}-day.mp4 · 0:30</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>{([["Copy link", "Copied!"], ["Save", "Saved!"], ["Post", "Shared!"]] as const).map(([label, msg]) => <button key={label} type="button" style={btn} onClick={() => setToast(msg)}>{label}</button>)}</div>
          <button type="button" onClick={() => setState("idle")} style={{ ...btn, border: 0, boxShadow: "none", background: "none", textDecoration: "underline", marginTop: 10 }}>Close</button>
        </>}
      </div>
      {toast && <p role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#221c28", color: "#ffd23f", border: "3px solid #ffd23f", padding: "8px 16px", font: "700 13px monospace" }}>{toast}</p>}
    </div>}
  </>;
}

/** The hardcoded demo day: prebuilt london-25d scenes played in an embedded canvas game. */
export function DemoDayViewer() {
  const [shareState, setShareState] = useState<"idle" | "copied" | "fallback">("idle");
  const [shareUrl, setShareUrl] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  async function share() {
    const url = window.location.href;
    setShareUrl(url);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("fallback");
    }
  }
  return <main className={styles.viewer}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>DAYQUEST<span>A day worth visiting</span></Link>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ClipShare />
        <button type="button" onClick={share} className={styles.share}>{shareState === "copied" ? "LINK COPIED ✓" : "SHARE THIS DAY ↗"}</button>
      </div>
    </header>
    <p className={styles.shareStatus} aria-live="polite">{shareState === "copied" ? "Day link copied to clipboard." : ""}</p>
    {shareState === "fallback" && <label className={styles.copyLabel}>Copy this day link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} aria-label="Day share link" /></label>}
    <section className={styles.intro}>
      <div><p className={styles.kicker}>A LITTLE WINDOW INTO THEIR DAY</p><h1>{DEMO_DAY.name}&apos;s day</h1><p className={styles.date}>{DEMO_DAY.date}</p></div>
      {/* The sprite is already pixel processed; preserve its exact pixels. */}
      <div className={styles.player}><img src={DEMO_SPRITE_URL} width={64} height={96} alt={`${DEMO_DAY.name}'s character`} /></div>
    </section>
    <section aria-label="Playable day" style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1f1a2e", padding: 12 }}>
      <p style={{ color: "#f6f1df", font: "11px monospace", lineHeight: 1.6, textAlign: "center", margin: "0 0 8px" }}>
        Click the world to play · Arrows / WASD: walk · Shift: run · Space / Enter: read · Walk onto the yellow signs to travel
      </p>
      <iframe ref={frame} src={DEMO_DAY.game} title={`${DEMO_DAY.name}'s day in London`} onLoad={() => frame.current?.focus()}
        style={{ width: "100%", maxWidth: 960, height: "clamp(440px, 66.6vw, 640px)", border: "4px solid #f6f1df", background: "#14121a" }} />
    </section>
    <section className={styles.itinerary} aria-labelledby="itinerary-title">
      <div className={styles.sectionHeading}><h2 id="itinerary-title">Today&apos;s places</h2><span>{DEMO_DAY.scenes.length} CHAPTERS</span></div>
      <ol className={styles.scenes}>{DEMO_DAY.scenes.map((scene, index) => <li key={scene.title}>
        <span className={styles.sceneNumber}>0{index + 1}</span><p className={styles.kicker}>{scene.time} · {scene.kind.toUpperCase()}</p><h3>{scene.title}</h3>
        <p>{scene.landmarks.join(" · ")}</p><p>{scene.text}</p>
        {index < DEMO_DAY.transit.length && <p className={styles.kicker}>↓ {DEMO_DAY.transit[index]}</p>}
      </li>)}</ol>
    </section>
    <footer className={styles.footer}><span>Every day becomes a place you can visit.</span><Link href="/">Create your day →</Link></footer>
  </main>;
}
