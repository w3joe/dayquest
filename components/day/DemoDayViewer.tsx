"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { DEMO_DAY, DEMO_SPRITE_URL } from "@/lib/demo";
import styles from "./day.module.css";

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
      <button type="button" onClick={share} className={styles.share}>{shareState === "copied" ? "LINK COPIED ✓" : "SHARE THIS DAY ↗"}</button>
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
        style={{ width: "100%", maxWidth: 960, aspectRatio: "3 / 2", border: "4px solid #f6f1df", background: "#14121a" }} />
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
