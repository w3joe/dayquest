"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEMO_DAY, DEMO_SPRITE_URL } from "@/lib/demo";
import PixelSprite from "@/components/today/pixel";
import SoundToggle from "@/components/today/SoundToggle";
import styles from "./demo-day.module.css";

const tabs = [{ href: "/", id: "try", label: "Try me" }, { href: "/demo", id: "demo", label: "Demo" }] as const;
const cardTones = ["dq-card-pink", "dq-card-butter", "dq-card-mint"] as const;

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
    <button type="button" className={`dq-big-button ${styles.pill}`} onClick={() => { setProgress(0); setFrame(0); setState("rendering"); }}>SHARE AS VIDEO CLIP ▶</button>
    {state !== "idle" && createPortal(<div role="dialog" aria-label="Share as video clip" className={styles.overlay}>
      <div className={`dq-card dq-card-pink ${styles.modal}`}>
        {state === "rendering" ? <><p>Rendering your day…</p><div className={styles.bar}><span style={{ width: `${progress * 100}%` }} /></div></> : <>
          <div className={styles.preview}>
            <img src={scene.thumb} alt={scene.title} />
            <span>{scene.time} · {scene.title}</span>
          </div>
          <p>{DEMO_DAY.name.toLowerCase()}-day.mp4 · 0:30</p>
          <div className={styles.modalActions}>{([["Copy link", "Copied!"], ["Save", "Saved!"], ["Post", "Shared!"]] as const).map(([label, msg]) => <button key={label} type="button" className="dq-small-button" onClick={() => setToast(msg)}>{label}</button>)}</div>
          <button type="button" onClick={() => setState("idle")} className={styles.close}>Close</button>
        </>}
      </div>
      {toast && <p role="status" className={styles.toast}>{toast}</p>}
    </div>, document.body)}
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
  // Same frame as AppShell, but the game gets its own wider column so the iframe can stay ≥960px.
  return <div className="dq-app">
    <div className="dq-sky" aria-hidden="true"><PixelSprite name="cloud" size={6} className="dq-cloud dq-cloud-a" /><PixelSprite name="cloud" size={4} className="dq-cloud dq-cloud-b" /></div>
    <header className="dq-topbar"><Link href="/" className="dq-wordmark"><PixelSprite name="cat" size={2.5} className="dq-logo-sprite" /><span>dayquest</span></Link>
      <div className="dq-topbar-end"><nav className="dq-tabs" aria-label="Pages">{tabs.map(tab => <Link key={tab.id} href={tab.href} className={tab.id === "demo" ? "is-active" : undefined} aria-current={tab.id === "demo" ? "page" : undefined}>{tab.label}</Link>)}</nav><SoundToggle /></div></header>
    <main className="dq-main">
      <section className="dq-card dq-card-lav">
        <div className={styles.head}>
          <div className={styles.title}><span className={styles.kicker}>A little window into their day</span><h1>{DEMO_DAY.name}&apos;s day</h1><p className={styles.sub}>{DEMO_DAY.date}</p></div>
          {/* The sprite is already pixel processed; preserve its exact pixels. */}
          <div className={styles.player}><img src={DEMO_SPRITE_URL} width={64} height={96} alt={`${DEMO_DAY.name}'s character`} /></div>
        </div>
        <div className={styles.shareRow}>
          <ClipShare />
          <button type="button" onClick={share} className={`dq-big-button ${styles.pill}`}>{shareState === "copied" ? "LINK COPIED ✓" : "SHARE THIS DAY ↗"}</button>
        </div>
        <p className={styles.status} aria-live="polite" hidden={shareState !== "copied"}>{shareState === "copied" ? "Day link copied to clipboard." : ""}</p>
        {shareState === "fallback" && <label className={styles.copy}>Copy this day link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} aria-label="Day share link" /></label>}
      </section>
    </main>
    <div className={styles.gameWrap}>
      <section aria-label="Playable day" className={styles.game}>
        <p className={styles.hint}>Click the world to play · Arrows / WASD: walk · Shift: run · Space / Enter: read · Walk onto the yellow signs to travel</p>
        <iframe ref={frame} src={DEMO_DAY.game} title={`${DEMO_DAY.name}'s day in London`} onLoad={() => frame.current?.focus()} className={styles.frame} />
      </section>
    </div>
    <div className="dq-main">
      <section aria-labelledby="itinerary-title" style={{ display: "grid", gap: 18 }}>
        <div className={styles.sectionHead}><h2 id="itinerary-title">Today&apos;s places</h2><span className={styles.count}>{DEMO_DAY.scenes.length} chapters</span></div>
        <ol className={styles.scenes}>{DEMO_DAY.scenes.map((scene, index) => <li key={scene.title} className={`dq-card ${cardTones[index % cardTones.length]} ${styles.scene}`}>
          <div className={styles.sceneTop}>
            <div className={styles.thumb}><img src={scene.thumb} alt="" /></div>
            <div><span className={styles.kicker}>0{index + 1} · {scene.time} · {scene.kind}</span><h3>{scene.title}</h3></div>
          </div>
          <p className={styles.landmarks}>{scene.landmarks.join(" · ")}</p>
          <p className={styles.text}>{scene.text}</p>
          {index < DEMO_DAY.transit.length && <span className={`dq-chip ${styles.leg} ${index % 2 ? styles.legMint : ""}`}>↓ {DEMO_DAY.transit[index]}</span>}
        </li>)}</ol>
      </section>
      <div className={styles.cta}><p>Every day becomes a place you can visit.</p><Link href="/" className="dq-big-button">Create your day →</Link></div>
    </div>
    <footer className="dq-footer"><PixelSprite name="flower" size={2} /><span>Share your day with someone you love</span><PixelSprite name="flower" size={2} /></footer>
  </div>;
}
