"use client";

import { useEffect, useRef, useState } from "react";
import type { DayManifest } from "@/lib/day";
import styles from "./day.module.css";

export type GameMountProps = { manifest: DayManifest; manifestUrl: string };

/** Client-only Phaser mount. Phaser touches `window` on import, so it is loaded inside the effect and destroyed on cleanup. */
export function GameMount({ manifest, manifestUrl }: GameMountProps) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    import("@/game/main")
      .then(({ createGame }) => createGame(host.current!, manifest, manifestUrl))
      .then((handle) => {
        if (cancelled) handle.destroy();
        else destroy = handle.destroy;
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [manifest, manifestUrl]);

  if (error) return <section className={styles.game} aria-label="Game"><p className={styles.pending}>The game could not start in this browser. Try reloading the page.</p></section>;
  return <section aria-label="Playable day" style={{ display: "flex", justifyContent: "center", background: "#1f1a2e", padding: 12 }}>
    <div ref={host} style={{ width: "100%", maxWidth: 960, lineHeight: 0, display: "flex", justifyContent: "center", imageRendering: "pixelated" }} />
  </section>;
}
