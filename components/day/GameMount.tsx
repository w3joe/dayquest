"use client";

import { useEffect, useRef, useState } from "react";
import type { DayManifest } from "@/lib/day";
import styles from "./day.module.css";

export type GameMountProps = { manifest: DayManifest; manifestUrl: string; onShare?: () => Promise<void> };

/** Client-only Shadwell-style canvas runtime, destroyed on route/manifest changes. */
export function GameMount({ manifest, manifestUrl, onShare }: GameMountProps) {
  const host = useRef<HTMLDivElement>(null);
  const share = useRef(onShare);
  share.current = onShare;
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    setLoading(true);
    import("@/game/main")
      .then(({ createGame }) => cancelled || !host.current ? undefined : createGame(host.current, manifest, manifestUrl, () => share.current?.()))
      .then((handle) => {
        if (!handle) return;
        if (cancelled) handle.destroy();
        else { destroy = handle.destroy; setLoading(false); }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [manifest, manifestUrl]);

  if (error) return <section className={styles.game} aria-label="Game"><p className={styles.pending}>The game could not start in this browser. Try reloading the page.</p></section>;
  return <section aria-label="Playable day" style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1f1a2e", padding: 12 }}>
    <p aria-live="polite" style={{ color: "#f6f1df", font: "11px monospace", lineHeight: 1.6, textAlign: "center" }}>{loading ? "Loading your world…" : "Click the world to play · Arrows / WASD: walk · Space / Enter: read or skip · Touch controls below"}</p>
    <div ref={host} style={{ width: "100%", maxWidth: 960, lineHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", imageRendering: "pixelated" }} />
  </section>;
}
