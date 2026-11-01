"use client";

import Link from "next/link";
import { useState } from "react";
import { resolveDayAsset, type DayManifest } from "@/lib/day";
import { GameMount } from "./GameMount";
import styles from "./day.module.css";

function PlayerPreview({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.player}>{failed ? <span>Character preview unavailable</span> :
    // The sprite is already pixel processed; preserve its exact pixels.
    <img src={url} width={64} height={96} alt={name === "You" ? "Your character" : `${name}'s character`} onError={() => setFailed(true)} />}</div>;
}

export function DayViewer({ manifest, manifestUrl }: { manifest: DayManifest; manifestUrl: string }) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "fallback">("idle");
  const [shareUrl, setShareUrl] = useState("");
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
      <div><p className={styles.kicker}>A LITTLE WINDOW INTO THEIR DAY</p><h1>{manifest.player.name === "You" ? "Your day" : `${manifest.player.name}'s day`}</h1><p className={styles.date}>{manifest.date}</p></div>
      <PlayerPreview url={resolveDayAsset(manifest.player.sprite, manifestUrl)} name={manifest.player.name} />
    </section>
    <GameMount manifest={manifest} manifestUrl={manifestUrl} onShare={share} />
    <section className={styles.itinerary} aria-labelledby="itinerary-title">
      <div className={styles.sectionHeading}><h2 id="itinerary-title">Today&apos;s places</h2><span>{manifest.scenes.length} {manifest.scenes.length === 1 ? "PLACE TO EXPLORE" : "CHAPTERS"}</span></div>
      <ol className={styles.scenes}>{manifest.scenes.map((scene, index) => <li key={`${scene.kind}-${index}`}>
        <span className={styles.sceneNumber}>0{index + 1}</span><p className={styles.kicker}>{scene.time} · {scene.kind.toUpperCase()}</p><h3>{scene.title}</h3>
        <p>{scene.world ? scene.world.objects.filter((object) => object.id.startsWith("building_")).map((object) => object.name).join(" · ") : scene.landmarks.map((landmark) => landmark.name).join(" · ")}</p>
      </li>)}</ol>
    </section>
    <footer className={styles.footer}><span>Every day becomes a place you can visit.</span><Link href="/">Create your day →</Link></footer>
  </main>;
}
