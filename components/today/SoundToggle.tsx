"use client";

import { useEffect, useState } from "react";
import { loadMuted, setMuted, setPaused, sfx, startAudio } from "../../lib/sound";
import PixelSprite from "./pixel";

/** Mute button, plus the global listeners that start the music and play a blip on taps. */
export default function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(loadMuted());
    const onPointer = (event: Event) => {
      startAudio();
      const target = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (target && !(target as HTMLButtonElement).disabled) sfx.tap();
    };
    const onKey = () => startAudio();
    // iOS only unlocks audio inside click/touchend, not pointerdown.
    document.addEventListener("click", onKey);
    document.addEventListener("touchend", onKey);
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onKey);
      document.removeEventListener("touchend", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <button type="button" className="dq-sound" aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Turn sound off"} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>
    <PixelSprite name={muted ? "muted" : "speaker"} size={3} />
  </button>;
}
