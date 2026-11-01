"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GenerateEvent } from "@/pipeline/types";
import { DRAFT_STORAGE_KEY, isReadyDraft, parseStoredDraft, type ReadyDraft } from "@/lib/draft";
import styles from "./generating.module.css";

type Status = "running" | "done" | "error" | "no-draft";

const REPLAY_SECONDS = 8;

function readDraft(): ReadyDraft | null {
  try {
    const draft = parseStoredDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY));
    return isReadyDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<GenerateEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as GenerateEvent;
    if (done) return;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** §6.1 generating screen: live NDJSON from /api/generate-day, or ?replay=demo from the recorded run. */
export default function GeneratingPage() {
  const router = useRouter();
  const [events, setEvents] = useState<GenerateEvent[]>([]);
  const [status, setStatus] = useState<Status>("running");
  const [attempt, setAttempt] = useState(0);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setStatus("running");
    const replay = new URLSearchParams(window.location.search).get("replay");

    // Replays: the recorded run, with its timing compressed to ~REPLAY_SECONDS so the log stays genuine but snappy.
    async function runReplay() {
      const response = await fetch("/days/demo/events.ndjson", { cache: "no-store" });
      if (!response.ok || !response.body) throw new Error("No recorded demo run");
      const all: GenerateEvent[] = [];
      for await (const event of ndjson(response.body)) all.push(event);
      const total = Math.max(1, all.at(-1)?.at ?? 1);
      let previous = 0;
      for (const event of all) {
        await sleep(Math.min(1500, Math.max(120, (((event.at ?? previous) - previous) / total) * REPLAY_SECONDS * 1000)));
        previous = event.at ?? previous;
        if (cancelled) return;
        setEvents((list) => [...list, event]);
      }
      if (cancelled) return;
      setStatus("done");
      await sleep(1200);
      if (!cancelled) router.push("/day/demo");
    }
    // Live runs render events as they stream in.
    async function runLive() {
      const draft = readDraft();
      if (!draft) return setStatus("no-draft");
      const response = await fetch("/api/generate-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploads: draft.uploads, spriteUrl: draft.spriteUrl }),
      });
      if (!response.ok || !response.body) throw new Error("Generation could not start");
      let finished = false;
      for await (const event of ndjson(response.body)) {
        if (cancelled) return;
        setEvents((list) => [...list, event]);
        if (event.step === "error") return setStatus("error");
        if (event.step === "done" && event.id) {
          finished = true;
          setStatus("done");
          await sleep(1200);
          if (!cancelled) router.push(`/day/${event.id}`);
        }
      }
      if (!finished && !cancelled) setStatus("error");
    }

    (replay === "demo" ? runReplay() : runLive()).catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; };
  }, [attempt, router]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [events]);

  if (status === "no-draft") {
    return <main className="page-shell">
      <p className="eyebrow">DAYQUEST · GENERATING</p>
      <h1>Nothing to build yet.</h1>
      <p>Your photos and character live in the Today tab. Head back, add your fit check, then press End My Day.</p>
      <Link href="/">Back to Today</Link> · <Link href="/generating?replay=demo">Watch the demo day being built</Link>
    </main>;
  }

  return <main className={styles.screen}>
    <section className={styles.box} aria-live="polite">
      <p className={styles.title}>BUILDING YOUR DAY</p>
      <ol className={styles.log} ref={logRef}>
        {events.map((event, i) => <li key={i} className={event.step === "error" ? styles.error : undefined}>
          <span className={styles.prompt}>&gt;</span>
          <span className={styles.label}>{event.label}</span>
          {event.thumb && <img className={styles.thumb} src={event.thumb} alt="" />}
          {event.step === "done" && <span className={styles.arrow}>→</span>}
        </li>)}
        {status === "running" && <li><span className={styles.prompt}>&gt;</span><span className={styles.cursor}>▌</span></li>}
      </ol>
      {status === "error" && <p className={styles.actions}>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>TRY AGAIN</button>
        <Link href="/">BACK TO TODAY</Link>
      </p>}
    </section>
  </main>;
}
