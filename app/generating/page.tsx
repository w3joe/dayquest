"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GenerateEvent } from "@/pipeline/types";
import type { WorldJob } from "@/lib/world-job";
import { DRAFT_STORAGE_KEY, isReadyDraft, parseStoredDraft } from "@/lib/draft";
import styles from "./generating.module.css";

type Status = "running" | "done" | "error" | "no-draft";

/** Each poll advances one checkpointed unit, including after a reload. */
export default function GeneratingPage() {
  const router = useRouter();
  const [events, setEvents] = useState<GenerateEvent[]>([]);
  const [status, setStatus] = useState<Status>("running");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setError(""); setStatus("running");
    async function poll(retry: boolean) {
      const draft = parseStoredDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY));
      if (!isReadyDraft(draft)) { setStatus("no-draft"); return; }
      const response = await fetch("/api/world-jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, retry }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your world could not start. Please retry.");
      if (cancelled) return;
      const job = result as WorldJob;
      setEvents(job.events); setProgress({ completed: job.completed, total: job.total });
      if (job.status === "error") { setError(job.error || "World creation paused. Retry to continue."); setStatus("error"); return; }
      if (job.status === "done") {
        setStatus("done");
        timer = setTimeout(() => !cancelled && router.push(`/day/${job.id}`), 900);
        return;
      }
      timer = setTimeout(() => { void poll(false).catch(fail); }, 2000);
    }
    function fail(failure: unknown) {
      if (cancelled || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Connection interrupted. Retry to continue from your saved sprites.");
      setStatus("error");
    }
    // StrictMode's initial cleanup runs before the first POST.
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (new URLSearchParams(window.location.search).has("replay")) { router.replace("/"); return; }
      return poll(attempt > 0);
    }).catch(fail);
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt, router]);

  useEffect(() => { logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [events]);

  if (status === "no-draft") return <main className="page-shell">
    <p className="eyebrow">DAYQUEST · YOUR WORLD</p><h1>Start with your photos.</h1>
    <p>Add your outfit on Today, finish your character, then create a world from your place and lunch photos.</p>
    <Link href="/">Back to Today</Link>
  </main>;

  return <main className={styles.screen}><section className={styles.box} aria-live="polite">
    <p className={styles.title}>{status === "done" ? "YOUR WORLD IS READY" : "TURNING YOUR PHOTOS INTO A PLACE"}</p>
    <p className={styles.summary}>Buildings, little details, lunch, your walking character, and item interactions. Completed work is saved as we go.</p>
    {progress.total > 0 && <div className={styles.progress}><span>{progress.completed} / {progress.total} sprites saved</span><progress aria-label="Sprites saved" max={progress.total} value={progress.completed} /></div>}
    <ol className={styles.log} ref={logRef}>{events.filter(event => event.step !== "error").map((event, i) => <li key={i} className={event.step === "error" ? styles.error : undefined}>
      <span className={styles.prompt}>&gt;</span><span className={styles.label}>{event.label}</span>
      {event.thumb && <img className={styles.thumb} src={event.thumb} alt="Completed sprite" />}
      {event.step === "done" && <span className={styles.arrow}>→</span>}
    </li>)}{status === "running" && <li><span className={styles.prompt}>&gt;</span><span className={styles.cursor}>▌</span><span>{progress.total > 0 && progress.completed === progress.total ? "Preparing interactions and finishing your world…" : "Creating the next piece…"}</span></li>}</ol>
    {status === "error" && error && <p role="alert" className={styles.error}>{error}</p>}
    {status === "error" && <p className={styles.actions}><button type="button" onClick={() => setAttempt(n => n + 1)}>CONTINUE BUILDING</button><Link href="/">BACK TO TODAY</Link></p>}
  </section></main>;
}
