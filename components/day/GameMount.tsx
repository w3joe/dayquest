"use client";

import type { DayManifest } from "@/lib/day";
import styles from "./day.module.css";

/** A replaces this component's body with its client-only Phaser mount and teardown. */
export type GameMountProps = { manifest: DayManifest; manifestUrl: string };

export function GameMount({ manifest }: GameMountProps) {
  return <section className={styles.game} aria-label="Game integration status">
    <span className={styles.gameIcon} aria-hidden="true">✦</span>
    <p className={styles.kicker}>WORLD DATA LOADED</p>
    <h2>{manifest.scenes.length} places, one day.</h2>
    <p>The playable world is waiting for the game integration.</p>
    <p className={styles.pending}>Scene movement and transport become available when the game module is connected.</p>
  </section>;
}
