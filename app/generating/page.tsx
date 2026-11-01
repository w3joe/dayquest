"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Integration boundary: B replaces this page with the NDJSON generation log.
// Retain dayquest:draft so uploaded assets and the prepared sprite survive navigation.
export default function GeneratingBoundary() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem("dayquest:draft") ?? "null");
      setReady(Boolean(draft?.spriteUrl));
    } catch { setReady(false); }
  }, []);
  return <main className="page-shell">
    <p className="eyebrow">DAYQUEST · YOUR DAY</p>
    <h1>{ready ? "Your character is ready." : "Start with your fit check."}</h1>
    <p>{ready ? "Your uploaded photos and character are saved for this tab. The world-generation pipeline is still being connected." : "Return to Today to upload your photos and prepare your character."}</p>
    <p>The playable world and generation log will appear here when the game and pipeline are integrated.</p>
    <Link href="/">Back to Today</Link>
  </main>;
}
