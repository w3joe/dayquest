"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GenerateEvent } from "@/pipeline/types";
import type { WorldJob } from "@/lib/world-job";
import { DRAFT_STORAGE_KEY, isReadyDraft, parseStoredDraft } from "@/lib/draft";
import { DEMO_DAY, DEMO_EVENTS, isDemoRun, markDemoRun } from "@/lib/demo";
import AppShell from "@/components/today/AppShell";
import PixelSprite from "@/components/today/pixel";
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
  const [demoRun, setDemoRun] = useState(false);
  useEffect(() => setDemoRun(isDemoRun()), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setError(""); setStatus("running");
    if (isDemoRun()) {
      // Demo: replay a fixed log over the prebuilt sprites; nothing is generated or fetched.
      const sprites = DEMO_EVENTS.filter((e) => e.thumb).length;
      let i = 0, saved = 0;
      setEvents([]); setProgress({ completed: 0, total: sprites });
      const next = () => {
        if (cancelled) return;
        const { delay, ...event } = DEMO_EVENTS[i++];
        if (event.thumb) saved++;
        setEvents((current) => [...current, event]);
        setProgress({ completed: saved, total: sprites });
        if (i < DEMO_EVENTS.length) timer = setTimeout(next, delay);
        else { setStatus("done"); timer = setTimeout(() => !cancelled && router.push(`/day/${DEMO_DAY.id}`), 1100); }
      };
      timer = setTimeout(next, 300);
      return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }
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
      if (job.status === "error") { fail(new Error(job.error || "World creation paused. Retry to continue.")); return; }
      if (job.status === "done") {
        setStatus("done");
        timer = setTimeout(() => !cancelled && router.push(`/day/${job.id}`), 900);
        return;
      }
      timer = setTimeout(() => { void poll(false).catch(fail); }, 2000);
    }
    function fail(failure: unknown) {
      if (cancelled || controller.signal.aborted) return;
      const message = failure instanceof Error ? failure.message : "Connection interrupted. Retry to continue from your saved sprites.";
      // no API key on this server: show the prebuilt demo world instead of a dead end
      if (/OPENAI_API_KEY|not configured/i.test(message)) { markDemoRun(true); router.replace("/generating?demo=1"); setAttempt(n => n + 1); return; }
      setError(message);
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

  if (status === "no-draft") return <AppShell active="try"><section className={`dq-card dq-card-butter ${styles.card}`}>
    <span className={styles.eyebrow}>DayQuest · your world</span><h1 className={styles.title}>Start with your photos.</h1>
    <p className={styles.summary}>Add your outfit on Today, finish your character, then create a world from your place and lunch photos.</p>
    <p className={styles.actions}><Link href="/" className="dq-small-button">Back to Today</Link></p>
  </section></AppShell>;

  const done = status === "done";
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return <AppShell active={demoRun ? "demo" : "try"}><section className={`dq-card dq-card-pink ${styles.card}`} aria-live="polite">
    <div className={styles.head}>
      <PixelSprite name={done ? "heart" : "star"} size={3} className={done ? styles.headSprite : `${styles.headSprite} dq-hop`} />
      <div className={styles.headText}><span className={styles.eyebrow}>{done ? "All done" : "Building your world"}</span>
        <h1 className={styles.title}>{done ? "Your world is ready!" : "Turning your photos into a place"}</h1></div>
      {progress.total > 0 && <span className={`dq-chip ${done ? "dq-chip-mint" : "dq-chip-pink"}`}>{progress.completed} / {progress.total}</span>}
    </div>
    <p className={styles.summary}>Buildings, little details, lunch, your walking character, and item interactions. Completed work is saved as we go.</p>
    {progress.total > 0 && <div className={styles.progress}>
      <div className={styles.progressLabel}><span>{progress.completed} / {progress.total} sprites saved</span><span>{pct}%</span></div>
      <div className={styles.bar} role="progressbar" aria-label="Sprites saved" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed}><span style={{ width: `${pct}%` }} /></div>
    </div>}
    <ol className={styles.log} ref={logRef}>{events.map((event, i) => <li key={i} className={event.step === "error" ? styles.error : undefined}>
      <span className={styles.prompt}>&gt;</span><span className={styles.label}>{event.label}</span>
      {event.thumb && <span className={styles.thumb}><img src={event.thumb} alt="Completed sprite" /></span>}
      {event.step === "done" && <span className={styles.arrow}>→</span>}
    </li>)}{status === "running" && <li><span className={styles.prompt}>&gt;</span><span className={styles.label}>{progress.total > 0 && progress.completed === progress.total ? "Preparing interactions and finishing your world…" : "Creating the next piece…"}<span className={styles.cursor}>▌</span></span></li>}</ol>
    {status === "error" && error && <p role="alert" className={`${styles.error} ${styles.alert}`}>{error}</p>}
    {status === "error" && <p className={styles.actions}><button type="button" className="dq-big-button" onClick={() => setAttempt(n => n + 1)}>Continue building</button><button type="button" className="dq-small-button" onClick={() => { markDemoRun(true); router.replace("/generating?demo=1"); setAttempt(n => n + 1); }}>See the demo world</button><Link href="/" className="dq-small-button">Back to Today</Link></p>}
  </section></AppShell>;
}
