"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import day from "../../data/input.json";

type Kind = "fit" | "fit_back" | "lunch" | "landmark" | "park";
type Photo = { url?: string; preview?: string; matching?: string; error?: string; busy?: boolean; manualMatch?: boolean };
type Draft = { sessionId: string; uploads: { kind: Kind; url: string }[]; spriteUrl?: string };
const key = "dayquest:draft";
const quests: { kind: Kind; name: string; hint: string; icon: string }[] = [
  { kind: "fit", name: "Today's fit", hint: "Full body · front view · required", icon: "♟" },
  { kind: "fit_back", name: "The other side", hint: "Back view · optional", icon: "♟" },
  { kind: "lunch", name: "Lunch break", hint: "Your bowl, plate, or little treat", icon: "♨" },
  { kind: "landmark", name: "Somewhere special", hint: "A view worth remembering · optional", icon: "♜" },
  { kind: "park", name: "A breath of fresh air", hint: "A moment in the green · optional", icon: "♧" },
];

async function preview(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not preview this image.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { bitmap.close(); }
}

async function matchPhoto(file: File): Promise<string> {
  try {
    const { parse } = await import("exifr");
    const metadata = await parse(file, ["DateTimeOriginal", "CreateDate"]);
    const time = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
    if (!(time instanceof Date) || Number.isNaN(time.getTime())) return "No photo time found · add to this day";
    // EXIF camera dates are wall-clock values, not UTC timestamps.
    const minute = time.getHours() * 60 + time.getMinutes();
    const nearest = day.locations.reduce((best, stop) => {
      const difference = (t: string) => { const [h, m] = t.split(":").map(Number); return Math.abs(h * 60 + m - minute); };
      return difference(stop.t) < difference(best.t) ? stop : best;
    });
    return `Matched to ${nearest.t} · ${nearest.label}`;
  } catch { return "No photo time found · add to this day"; }
}

function LocationSync() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setCount(n => Math.min(n + 1, day.locations.length)), 220);
    return () => window.clearInterval(timer);
  }, []);
  const points = day.locations.map(stop => ({ x: 32 + ((stop.lng + .163) / .048) * 336, y: 25 + ((51.531 - stop.lat) / .034) * 235 }));
  return <section className="dq-panel dq-location" aria-labelledby="location-title">
    <div className="dq-section-heading"><div><span className="dq-eyebrow">01 / THE PLACES</span><h2 id="location-title">A little further from home.</h2></div><span className="dq-status"><span className="dq-status-dot" />{count === day.locations.length ? "DAY SYNCED" : "SYNCING…"}</span></div>
    <div className="dq-map-grid"><div className="dq-map">
      <svg viewBox="0 0 400 290" role="img" aria-label="Illustrated London route from Westminster through Soho to Regent’s Park">
        <defs><pattern id="blocks" width="32" height="28" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="20" height="16" fill="#e4dfca"/><path d="M0 25H32M28 0V28" stroke="#f6f1df" strokeWidth="5"/></pattern></defs>
        <rect width="400" height="290" fill="url(#blocks)"/><path d="M0 226H120V241H187V256H246V273H400V290H219V276H171V260H107V247H0Z" fill="#98c6c8"/>
        <path d="M16 18H129V91H107V116H16Z" fill="#b1c48d"/><path d="M34 39H106V76H81V95H34Z" fill="#c9d8a4"/><path d="M26 105L111 30M164 0V206M0 165H400M253 0V240" stroke="#faf5e4" strokeWidth="10"/>
        <text x="21" y="22" className="dq-map-label">REGENT’S PARK</text><text x="222" y="119" className="dq-map-label">SOHO</text><text x="202" y="224" className="dq-map-label">WESTMINSTER</text><text x="302" y="280" className="dq-map-label">THAMES</text>
        <polyline points={points.slice(0, count).map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#bd684b" strokeWidth="3" strokeDasharray="4 5"/>
        {points.slice(0, count).map((p, i) => <g key={i}><rect x={p.x - 5} y={p.y - 5} width="10" height="10" fill="#faf4de" stroke="#38483d" strokeWidth="2"/><rect x={p.x - 2} y={p.y - 2} width="4" height="4" fill="#bd684b"/></g>)}
      </svg><div className="dq-map-caption"><span>⌖ LONDON, UK</span><span>ILLUSTRATED MAP</span></div>
    </div><div className="dq-timeline"><div className="dq-timeline-top"><span>YOUR DAY, IN LITTLE STOPS</span><span>{String(count).padStart(2, "0")} / 12</span></div><div className="dq-stop-list" aria-label="Location history">{day.locations.map((stop, i) => <div key={`${stop.t}-${stop.label}`} className={`dq-stop ${i < count ? "is-synced" : ""}`}><time>{stop.t}</time><span className="dq-stop-marker" /><span>{stop.label}</span><span aria-hidden="true">{i < count ? "✓" : "·"}</span></div>)}</div></div></div>
    <div className="dq-sync-footer"><span>Demo location history · {day.locations.length} stops</span><span>{Math.round(count / day.locations.length * 100)}%</span></div><div className="dq-progress" role="progressbar" aria-label="Location sync" aria-valuemin={0} aria-valuemax={12} aria-valuenow={count}><span style={{ width: `${count / 12 * 100}%` }}/></div>
  </section>;
}

export default function Today() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<Kind, Photo>>>({});
  const [spriteUrl, setSpriteUrl] = useState<string>();
  const [spriteBusy, setSpriteBusy] = useState(false);
  const [spriteError, setSpriteError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [health, setHealth] = useState<"idle" | "syncing" | "done">("idle");
  const files = useRef<Partial<Record<Kind, File>>>({});
  const operations = useRef<Partial<Record<Kind, number>>>({});
  const generation = useRef(0);
  const pendingFits = useRef(new Map<Kind, number>());
  const pendingFiles = useRef<Partial<Record<Kind, File>>>({});
  const uploadedUrls = useRef<Partial<Record<Kind, string>>>({});
  const generationRunning = useRef(false);
  const generationRequested = useRef(false);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const healthTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const draft = JSON.parse(saved) as Draft;
        if (typeof draft.sessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.sessionId) && Array.isArray(draft.uploads)) {
          setSessionId(draft.sessionId);
          uploadedUrls.current = Object.fromEntries(draft.uploads.filter(p => quests.some(q => q.kind === p.kind) && typeof p.url === "string").map(p => [p.kind, p.url]));
          setPhotos(Object.fromEntries(draft.uploads.filter(p => quests.some(q => q.kind === p.kind) && typeof p.url === "string").map(p => [p.kind, { url: p.url, preview: p.url, matching: "Saved to today's day" }])));
          if (typeof draft.spriteUrl === "string") setSpriteUrl(draft.spriteUrl);
          else if (draft.uploads.some(p => p.kind === "fit")) setSpriteError("Your character was not saved. Retry or add your front photo again.");
          return;
        }
      }
    } catch { /* Start a fresh draft if old storage is invalid. */ }
    setSessionId(crypto.randomUUID());
    }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (healthTimer.current) clearTimeout(healthTimer.current);
      for (const request of requests.current) request.abort();
    };
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ sessionId, uploads: Object.entries(photos).filter(([, p]) => p.url).map(([kind, p]) => ({ kind, url: p.url })), spriteUrl }));
      setStorageError("");
    } catch { setStorageError("Your browser could not save this draft. Enable session storage to continue."); }
  }, [sessionId, photos, spriteUrl]);

  function update(kind: Kind, value: Partial<Photo>) {
    if (mounted.current) setPhotos(current => ({ ...current, [kind]: { ...current[kind], ...value } }));
  }
  async function makeSprite() {
    if (!mounted.current || pendingFits.current.size || generationRunning.current || !uploadedUrls.current.fit) return;
    generationRequested.current = false;
    generationRunning.current = true;
    const attempt = generation.current;
    const controller = new AbortController();
    requests.current.add(controller);
    let front = files.current.fit;
    const frontUrl = uploadedUrls.current.fit;
    let back = files.current.fit_back;
    const backUrl = uploadedUrls.current.fit_back;
    setSpriteBusy(true); setSpriteError(""); setSpriteUrl(undefined);
    try {
      if (!front) {
        const savedPhoto = await fetch(frontUrl, { signal: controller.signal });
        if (!savedPhoto.ok) throw new Error("Could not restore your fit. Please add your front photo again.");
        front = new File([await savedPhoto.blob()], "fit.png", { type: "image/png" });
        if (attempt === generation.current) files.current.fit = front;
      }
      if (!back && backUrl) {
        const savedBack = await fetch(backUrl, { signal: controller.signal });
        if (!savedBack.ok) throw new Error("Could not restore your back photo. Please add it again.");
        back = new File([await savedBack.blob()], "fit-back.png", { type: "image/png" });
        if (attempt === generation.current) files.current.fit_back = back;
      }
      if (!mounted.current || attempt !== generation.current) return;
      if (front.size + (back?.size ?? 0) > 4 * 1024 * 1024) throw new Error("Front and back photos must total less than 4 MB. Replace one with a smaller photo.");
      const form = new FormData(); form.set("photo", front); form.set("sessionId", sessionId);
      if (back) form.set("backPhoto", back);
      const response = await fetch("/api/fit-check", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.spriteUrl !== "string") throw new Error(result.error || "Character generation failed. Please try again.");
      if (mounted.current && attempt === generation.current) setSpriteUrl(result.spriteUrl);
    } catch (error) {
      if (mounted.current && attempt === generation.current && !controller.signal.aborted) setSpriteError(error instanceof Error ? error.message : "Character generation failed.");
    } finally {
      requests.current.delete(controller);
      generationRunning.current = false;
      if (mounted.current) {
        setSpriteBusy(false);
        if (generationRequested.current) void makeSprite();
      }
    }
  }
  async function upload(kind: Kind, file?: File) {
    if (!file || !sessionId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { update(kind, { error: "Choose a JPEG, PNG, or WebP photo." }); return; }
    if (file.size > 4 * 1024 * 1024) { update(kind, { error: "Choose an image smaller than 4 MB." }); return; }
    const isFit = kind === "fit" || kind === "fit_back";
    const otherFit = kind === "fit" ? "fit_back" : "fit";
    if (isFit && file.size + ((pendingFiles.current[otherFit] ?? files.current[otherFit])?.size ?? 0) > 4 * 1024 * 1024) {
      update(kind, { error: "Front and back photos must total less than 4 MB. Choose a smaller photo." }); return;
    }
    const attempt = (operations.current[kind] ?? 0) + 1; operations.current[kind] = attempt;
    const controller = new AbortController();
    requests.current.add(controller);
    let succeeded = false;
    update(kind, { busy: true, error: undefined, url: undefined });
    if (isFit) {
      pendingFits.current.set(kind, attempt);
      pendingFiles.current[kind] = file;
      delete files.current[kind];
      delete uploadedUrls.current[kind];
      ++generation.current;
      setSpriteUrl(undefined);
    }
    try {
      const [thumbnail, matching] = await Promise.all([preview(file), matchPhoto(file)]);
      if (!mounted.current || operations.current[kind] !== attempt) return;
      update(kind, { preview: thumbnail, matching, manualMatch: matching.startsWith("No photo time") });
      const form = new FormData(); form.set("photo", file); form.set("kind", kind); form.set("sessionId", sessionId);
      const response = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Upload failed. Select the photo to retry.");
      if (!mounted.current || operations.current[kind] !== attempt) return;
      files.current[kind] = file;
      uploadedUrls.current[kind] = result.url;
      succeeded = true;
      update(kind, { url: result.url, busy: false });
    } catch (error) {
      if (operations.current[kind] === attempt && !controller.signal.aborted) update(kind, { busy: false, error: error instanceof Error ? error.message : "Upload failed. Please try again." });
    } finally {
      requests.current.delete(controller);
      if (isFit && pendingFits.current.get(kind) === attempt) {
        pendingFits.current.delete(kind);
        delete pendingFiles.current[kind];
        if (succeeded) generationRequested.current = true;
        if (mounted.current && generationRequested.current) void makeSprite();
      }
    }
  }
  const uploaded = Object.values(photos).filter(p => p.url).length;
  const uploading = Object.values(photos).some(p => p.busy);
  const canFinish = !!photos.fit?.url && !!spriteUrl && !uploading && !spriteBusy && !storageError;
  const workout = day.workouts[0];
  return <main className="dq-shell">
    <header className="dq-header"><a href="/" className="dq-wordmark"><span className="dq-brand-icon">✦</span> dayquest<span className="dq-wordmark-dot">.</span></a><span className="dq-header-note">A DAY WORTH VISITING</span><a href="/day/demo" className="dq-demo-link">Explore a demo <span>↗</span></a></header>
    <div className="dq-hero"><div><p className="dq-eyebrow">{day.user.name}'S DAY / LONDON CHAPTER</p><h1>Ordinary day.<br/><span>Extraordinary little world.</span></h1><p className="dq-intro">The places you went. The things you ate. The outfit you wore.<br className="dq-desktop-break"/> Gather today’s little moments, and give someone a place to visit.</p></div><div className="dq-date-card"><span>SATURDAY</span><strong>07</strong><span>NOVEMBER 2026</span><div>✦ SAVE THE LITTLE THINGS</div></div></div>
    <div className="dq-content"><LocationSync/>
    <section className="dq-panel" aria-labelledby="photos-title"><div className="dq-section-heading"><div><span className="dq-eyebrow">02 / THE LITTLE MOMENTS</span><h2 id="photos-title">What did today look like?</h2></div><span className="dq-counter">{uploaded} / 5 COLLECTED</span></div><p className="dq-section-copy">Start with your fit. Add a few memories. We’ll turn them into pixels.</p>
      <div className="dq-photo-grid">{quests.map(quest => { const photo = photos[quest.kind]; return <div className={`dq-photo-card ${photo?.url ? "is-uploaded" : ""} ${quest.kind === "fit" ? "dq-photo-required" : ""}`} key={quest.kind}>
        <label className="dq-upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(quest.kind, event.dataTransfer.files[0]); }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={`Upload ${quest.name}`} disabled={!sessionId} onChange={event => { void upload(quest.kind, event.target.files?.[0]); event.target.value = ""; }}/>
          <span className="dq-upload-check" aria-label={photo?.url ? "Uploaded" : "Not uploaded"}>{photo?.url ? "✓" : ""}</span>
          {photo?.preview ? <img src={photo.preview} alt={`${quest.name} pixel preview`} className="dq-photo-preview"/> : <span className="dq-photo-icon" aria-hidden="true">{quest.icon}</span>}
          <span className="dq-photo-action">{photo?.busy ? "SAVING…" : photo?.preview ? "REPLACE PHOTO +" : "ADD PHOTO +"}</span>
        </label><div className="dq-photo-info"><h3>{quest.name}</h3><p>{quest.hint}</p>{photo?.matching && <p className="dq-photo-match">{photo.matching}</p>}{photo?.manualMatch && <label className="dq-stop-picker">Choose a stop (optional)<select aria-label={`Match ${quest.name} to a stop`} defaultValue="" onChange={event => update(quest.kind, { matching: event.target.value ? `Matched to ${event.target.value}` : "No photo time found · add to this day" })}><option value="">Leave unmatched</option>{day.locations.map(stop => <option key={`${stop.t}-${stop.label}`} value={`${stop.t} · ${stop.label}`}>{stop.t} · {stop.label}</option>)}</select></label>}{photo?.error && <p className="dq-error" role="alert">{photo.error}</p>}</div>
      </div>; })}</div>
      <div className="dq-sprite-status" aria-live="polite">{spriteUrl ? <><img src={spriteUrl} alt="Your generated back-facing pixel character"/><div><strong>Your little adventurer is ready.</strong><span>Same outfit. A whole new perspective.</span></div><span className="dq-sprite-tick">✓</span></> : <><span className="dq-character-placeholder" aria-hidden="true">♟</span><div><strong>{spriteBusy ? "Stitching your outfit into pixels…" : "Every adventure starts with you."}</strong><span>{spriteError || "Add a front fit photo to create your character. A back view helps too."}</span></div>{spriteError && <button type="button" className="dq-small-button" disabled={spriteBusy} onClick={() => void makeSprite()}>Retry character</button>}</>}</div>
    </section>
    <div className="dq-bottom-grid"><section className="dq-panel dq-health" aria-labelledby="health-title"><span className="dq-eyebrow">03 / A LITTLE MOVEMENT</span><h2 id="health-title">Good for the soul.</h2><p className="dq-section-copy">A walk through the park belongs in your story, too.</p>{health === "done" ? <div className="dq-walk-stats"><span className="dq-walk-icon">♧</span><div><strong>AFTERNOON WALK</strong><p>{workout.distanceKm} KM <span>·</span> {workout.durationMin} MIN <span>·</span> {workout.steps.toLocaleString("en-GB")} STEPS</p></div><span>✓</span></div> : <button type="button" className="dq-health-button" disabled={health === "syncing"} onClick={() => { setHealth("syncing"); healthTimer.current = setTimeout(() => setHealth("done"), 1500); }}><span>♥</span> {health === "syncing" ? "SYNCING YOUR WALK…" : "IMPORT FROM HEALTH"}<span>+</span></button>}<p className="dq-footnote">DEMO IMPORT · SAMPLE WALK DATA</p></section>
    <section className="dq-panel dq-transport" aria-labelledby="transport-title"><span className="dq-eyebrow">04 / BETWEEN THE MOMENTS</span><h2 id="transport-title">How you got there.</h2><div className="dq-transport-list">{day.transport.map((leg, i) => <div className="dq-transport-row" key={i}><span className={`dq-line-chip ${leg.mode === "bus" ? "dq-bus" : leg.line === "Bakerloo" ? "dq-bakerloo" : "dq-central"}`}>{leg.mode === "bus" ? `BUS ${leg.route}` : leg.line}</span><span>{leg.from}<span className="dq-route-arrow"> → </span>{leg.to}</span></div>)}</div><p className="dq-footnote">AUTO-DETECTED FROM DEMO LOCATION HISTORY</p></section></div>
    <section className="dq-finish"><div><span className="dq-eyebrow">ALL THE LITTLE PIECES, ONE LITTLE WORLD.</span><h2>Ready to call it a day?</h2><p>{spriteBusy ? "Your character is being created. This can take a minute." : !photos.fit?.url ? "Add your fit check above to begin your adventure." : uploading ? "Just saving your latest memories…" : spriteUrl ? "Three places. One adventure. Someone to share it with." : "Your character needs to be ready before you set off."}</p>{storageError && <p className="dq-error" role="alert">{storageError}</p>}</div><button type="button" className="dq-end-button" disabled={!canFinish} onClick={() => router.push("/generating")}>END MY DAY <span>→</span></button></section>
    </div><footer className="dq-footer"><span>MADE OF THE LITTLE THINGS.</span><span>DAYQUEST / LONDON, 2026</span></footer>
  </main>;
}
