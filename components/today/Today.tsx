"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import defaultDay from "../../data/input.json";
import { DRAFT_STORAGE_KEY, isReadyDraft, parseStoredDraft, type UploadKind } from "../../lib/draft";
import { discardPhotoUpload, startPhotoUpload, type Photo } from "../../lib/photo-upload";
import SpritePreview, { type SpriteVerification } from "./SpritePreview";
import { browserId } from "../../lib/browser-id";

type Kind = Extract<UploadKind, "fit" | "lunch" | "landmark">;
const quests: { kind: Kind; name: string; hint: string; icon: string }[] = [
  { kind: "fit", name: "Today's fit", hint: "Full body · front view · required", icon: "♟" },
  { kind: "lunch", name: "Lunch break", hint: "Your bowl, plate, or little treat", icon: "♨" },
  { kind: "landmark", name: "Somewhere special", hint: "A view worth remembering · optional", icon: "♜" },
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

type DayData = typeof defaultDay;

async function matchPhoto(file: File, day: DayData): Promise<string> {
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

function LocationSync({ day, onSample, sampleState, sampleNote }: { day: DayData; onSample: () => void; sampleState: "idle" | "loading" | "done" | "error"; sampleNote: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    const timer = window.setInterval(() => setCount(n => Math.min(n + 1, day.locations.length)), 220);
    return () => window.clearInterval(timer);
  }, [day]);
  const points = day.locations.map(stop => ({ x: 32 + ((stop.lng + .163) / .048) * 336, y: 25 + ((51.531 - stop.lat) / .034) * 235 }));
  return <section className="dq-panel dq-location" aria-labelledby="location-title">
    <div className="dq-section-heading"><div><span className="dq-eyebrow">01 / THE PLACES</span><h2 id="location-title">A little further from home.</h2></div><span className="dq-status"><span className="dq-status-dot" />{count === day.locations.length ? "DAY SYNCED" : "SYNCING…"}</span></div>
    <div className="dq-sample"><button type="button" className="dq-small-button" onClick={onSample} disabled={sampleState === "loading"}>{sampleState === "loading" ? "READING ROUTE…" : sampleState === "done" ? "SAMPLE ROUTE LOADED ✓" : "USE SAMPLE ROUTE"}</button><span className="dq-footnote" role="status">{sampleNote || "No location history of your own? Load a made-up London day to see the whole flow."}</span></div>
    <div className="dq-map-grid"><div className="dq-map">
      <svg viewBox="0 0 400 290" role="img" aria-label="Illustrated London route from Westminster through Soho to Regent’s Park">
        <defs><pattern id="blocks" width="32" height="28" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="20" height="16" fill="#e4dfca"/><path d="M0 25H32M28 0V28" stroke="#f6f1df" strokeWidth="5"/></pattern></defs>
        <rect width="400" height="290" fill="url(#blocks)"/><path d="M0 226H120V241H187V256H246V273H400V290H219V276H171V260H107V247H0Z" fill="#98c6c8"/>
        <path d="M16 18H129V91H107V116H16Z" fill="#b1c48d"/><path d="M34 39H106V76H81V95H34Z" fill="#c9d8a4"/><path d="M26 105L111 30M164 0V206M0 165H400M253 0V240" stroke="#faf5e4" strokeWidth="10"/>
        <text x="21" y="22" className="dq-map-label">REGENT’S PARK</text><text x="222" y="119" className="dq-map-label">SOHO</text><text x="202" y="224" className="dq-map-label">WESTMINSTER</text><text x="302" y="280" className="dq-map-label">THAMES</text>
        <polyline points={points.slice(0, count).map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#bd684b" strokeWidth="3" strokeDasharray="4 5"/>
        {points.slice(0, count).map((p, i) => <g key={i}><rect x={p.x - 5} y={p.y - 5} width="10" height="10" fill="#faf4de" stroke="#38483d" strokeWidth="2"/><rect x={p.x - 2} y={p.y - 2} width="4" height="4" fill="#bd684b"/></g>)}
      </svg><div className="dq-map-caption"><span>⌖ LONDON, UK</span><span>ILLUSTRATED MAP</span></div>
    </div><div className="dq-timeline"><div className="dq-timeline-top"><span>YOUR DAY, IN LITTLE STOPS</span><span>{String(count).padStart(2, "0")} / {String(day.locations.length).padStart(2, "0")}</span></div><div className="dq-stop-list" aria-label="Location history">{day.locations.map((stop, i) => <div key={`${stop.t}-${stop.label}`} className={`dq-stop ${i < count ? "is-synced" : ""}`}><time>{stop.t}</time><span className="dq-stop-marker" /><span>{stop.label}</span><span aria-hidden="true">{i < count ? "✓" : "·"}</span></div>)}</div></div></div>
    <div className="dq-sync-footer"><span>{sampleState === "done" ? "Synthetic sample route" : "Demo location history"} · {day.locations.length} stops</span><span>{Math.round(count / day.locations.length * 100)}%</span></div><div className="dq-progress" role="progressbar" aria-label="Location sync" aria-valuemin={0} aria-valuemax={day.locations.length} aria-valuenow={count}><span style={{ width: `${count / day.locations.length * 100}%` }}/></div>
  </section>;
}

export default function Today() {
  const router = useRouter();
  const [day, setDay] = useState<DayData>(defaultDay);
  const [sampleState, setSampleState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [sampleNote, setSampleNote] = useState("");
  async function useSampleRoute() {
    setSampleState("loading");
    setSampleNote("");
    try {
      // The real import path: the server parses a Timeline, Health and GPX package with recorded place lookups.
      const response = await fetch("/api/ingest?demo=1", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not read the sample route.");
      setDay(body.input as DayData);
      setSampleState("done");
      setSampleNote(`Read ${body.input.locations.length} stops, ${body.input.transport.length} transit legs and a ${body.input.workouts[0]?.distanceKm ?? 0} km walk from a made-up Timeline, Health and GPX export.${body.warnings?.length ? ` ${body.warnings.length} note(s).` : ""}`);
    } catch (error) {
      setSampleState("error");
      setSampleNote(error instanceof Error ? error.message : "Could not read the sample route.");
    }
  }
  const [sessionId, setSessionId] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<Kind, Photo>>>({});
  const [spriteUrl, setSpriteUrl] = useState<string>();
  const [spriteVerification, setSpriteVerification] = useState<SpriteVerification>();
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
  const generationController = useRef<AbortController | undefined>(undefined);
  const uploadControllers = useRef<Partial<Record<Kind, AbortController>>>({});
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const healthTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    try {
      const draft = parseStoredDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY));
      if (draft) {
        setSessionId(draft.sessionId);
        const uploads = draft.uploads.filter(p => quests.some(quest => quest.kind === p.kind));
        uploadedUrls.current = Object.fromEntries(uploads.map(p => [p.kind, p.url]));
        setPhotos(Object.fromEntries(uploads.map(p => [p.kind, { url: p.url, preview: p.url, matching: "Saved to today's day" }])));
        if (draft.spriteUrl) setSpriteUrl(draft.spriteUrl);
        else if (draft.uploads.some(p => p.kind === "fit")) setSpriteError("Your character was not saved. Retry or add your front photo again.");
        return;
      }
    } catch { /* Start a fresh draft if old storage is invalid. */ }
    setSessionId(browserId());
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
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ sessionId, uploads: Object.entries(photos).filter(([, p]) => p.url).map(([kind, p]) => ({ kind, url: p.url })), spriteUrl }));
      setStorageError("");
    } catch { setStorageError("Your browser could not save this draft. Enable session storage to continue."); }
  }, [sessionId, photos, spriteUrl]);

  function update(kind: Kind, value: Partial<Photo>) {
    if (mounted.current) setPhotos(current => ({ ...current, [kind]: { ...current[kind], ...value } }));
  }
  async function makeSprite() {
    if (!mounted.current || pendingFits.current.size || pendingFiles.current.fit || generationRunning.current || !uploadedUrls.current.fit) return;
    generationRequested.current = false;
    generationRunning.current = true;
    const attempt = generation.current;
    const controller = new AbortController();
    generationController.current = controller;
    requests.current.add(controller);
    let front = files.current.fit;
    const frontUrl = uploadedUrls.current.fit;
    setSpriteBusy(true); setSpriteError(""); setSpriteUrl(undefined);
    try {
      if (!front) {
        const savedPhoto = await fetch(frontUrl, { signal: controller.signal });
        if (!savedPhoto.ok) throw new Error("Could not restore your fit. Please add your front photo again.");
        front = new File([await savedPhoto.blob()], "fit.png", { type: "image/png" });
        if (attempt === generation.current) files.current.fit = front;
      }
      if (!mounted.current || attempt !== generation.current) return;
      if (front.size > 4 * 1024 * 1024) throw new Error("Choose a front photo smaller than 4 MB.");
      const form = new FormData(); form.set("photo", front); form.set("sessionId", sessionId);
      const response = await fetch("/api/fit-check", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.spriteUrl !== "string") throw new Error(result.error || "Character generation failed. Please try again.");
      if (mounted.current && attempt === generation.current) setSpriteUrl(result.spriteUrl);
    } catch (error) {
      if (mounted.current && attempt === generation.current && !controller.signal.aborted) setSpriteError(error instanceof Error ? error.message : "Character generation failed.");
    } finally {
      requests.current.delete(controller);
      if (generationController.current === controller) generationController.current = undefined;
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
    const isFit = kind === "fit";
    const attempt = (operations.current[kind] ?? 0) + 1; operations.current[kind] = attempt;
    uploadControllers.current[kind]?.abort();
    const controller = new AbortController();
    uploadControllers.current[kind] = controller;
    requests.current.add(controller);
    let succeeded = false;
    pendingFiles.current[kind] = file;
    setPhotos(current => ({ ...current, [kind]: startPhotoUpload(current[kind]) }));
    if (isFit) {
      // Preserve the committed outfit, but invalidate any in-flight generation.
      pendingFits.current.set(kind, attempt);
      if (generationRunning.current) generationRequested.current = true;
      ++generation.current;
      generationController.current?.abort();
    }
    try {
      const [thumbnail, matching] = await Promise.all([preview(file), matchPhoto(file, day)]);
      if (!mounted.current || operations.current[kind] !== attempt) return;
      update(kind, { preview: thumbnail, matching, manualMatch: matching.startsWith("No photo time") });
      const form = new FormData(); form.set("photo", file); form.set("kind", kind); form.set("sessionId", sessionId);
      const response = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Upload failed. Please try again.");
      if (!mounted.current || operations.current[kind] !== attempt) return;
      files.current[kind] = file;
      uploadedUrls.current[kind] = result.url;
      succeeded = true;
      delete pendingFiles.current[kind];
      update(kind, { url: result.url, busy: false, pending: false, previous: undefined });
      if (isFit) { setSpriteUrl(undefined); setSpriteError(""); }
    } catch (error) {
      if (operations.current[kind] === attempt && !controller.signal.aborted) update(kind, { busy: false, error: error instanceof Error ? error.message : "Upload failed. Please try again." });
    } finally {
      requests.current.delete(controller);
      if (uploadControllers.current[kind] === controller) delete uploadControllers.current[kind];
      if (isFit && pendingFits.current.get(kind) === attempt) {
        pendingFits.current.delete(kind);
        if (succeeded) generationRequested.current = true;
        if (mounted.current && generationRequested.current) void makeSprite();
      }
    }
  }
  function discardReplacement(kind: Kind) {
    operations.current[kind] = (operations.current[kind] ?? 0) + 1;
    uploadControllers.current[kind]?.abort();
    delete pendingFiles.current[kind];
    pendingFits.current.delete(kind);
    setPhotos(current => ({ ...current, [kind]: discardPhotoUpload(current[kind]) }));
    if (generationRequested.current) void makeSprite();
  }
  const uploaded = Object.values(photos).filter(p => p.url).length;
  const uploading = Object.values(photos).some(p => p.busy);
  const pendingChanges = Object.values(photos).some(p => p.pending);
  const pendingFitChanges = !!photos.fit?.pending;
  const spriteReady = !!spriteUrl && spriteVerification?.url === spriteUrl && spriteVerification.status === "ready";
  const canFinish = !!photos.fit?.url && spriteReady && !pendingChanges && !uploading && !spriteBusy && !storageError;
  function finishDay() {
    if (!canFinish || Object.keys(pendingFiles.current).length || generationRunning.current) return;
    const draft = {
      sessionId,
      uploads: Object.entries(uploadedUrls.current).map(([kind, url]) => ({ kind, url })),
      spriteUrl,
    };
    if (!isReadyDraft(draft)) return;
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setStorageError("");
      router.push("/generating");
    } catch {
      setStorageError("Your browser could not save this draft. Enable session storage to continue.");
    }
  }
  const workout = day.workouts[0];
  return <main className="dq-shell">
    <header className="dq-header"><a href="/" className="dq-wordmark"><span className="dq-brand-icon">✦</span> dayquest<span className="dq-wordmark-dot">.</span></a><span className="dq-header-note">A DAY WORTH VISITING</span></header>
    <div className="dq-hero"><div><p className="dq-eyebrow">{day.user.name}'S DAY / LONDON CHAPTER</p><h1>Ordinary day.<br/><span>Extraordinary little world.</span></h1><p className="dq-intro">The places you went. The things you ate. The outfit you wore.<br className="dq-desktop-break"/> Gather today’s little moments, and give someone a place to visit.</p></div><div className="dq-date-card"><span>SATURDAY</span><strong>07</strong><span>NOVEMBER 2026</span><div>✦ SAVE THE LITTLE THINGS</div></div></div>
    <div className="dq-content"><LocationSync day={day} onSample={useSampleRoute} sampleState={sampleState} sampleNote={sampleNote} />
    <section className="dq-panel" aria-labelledby="photos-title"><div className="dq-section-heading"><div><span className="dq-eyebrow">02 / THE LITTLE MOMENTS</span><h2 id="photos-title">What did today look like?</h2></div><span className="dq-counter">{uploaded} / {quests.length} COLLECTED</span></div><p className="dq-section-copy">Start with your fit. Add a few memories. We’ll turn them into pixels.</p>
      <div className="dq-photo-grid">{quests.map(quest => { const photo = photos[quest.kind]; return <div className={`dq-photo-card ${photo?.url ? "is-uploaded" : ""} ${quest.kind === "fit" ? "dq-photo-required" : ""}`} key={quest.kind}>
        <label className="dq-upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(quest.kind, event.dataTransfer.files[0]); }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={`Upload ${quest.name}`} disabled={!sessionId} onChange={event => { void upload(quest.kind, event.target.files?.[0]); event.target.value = ""; }}/>
          <span className="dq-upload-check" aria-label={photo?.url ? "Uploaded" : "Not uploaded"}>{photo?.url ? "✓" : ""}</span>
          {photo?.preview ? <img src={photo.preview} alt={`${quest.name} pixel preview`} className="dq-photo-preview"/> : <span className="dq-photo-icon" aria-hidden="true">{quest.icon}</span>}
          <span className="dq-photo-action">{photo?.busy ? "SAVING…" : photo?.preview ? "REPLACE PHOTO +" : "ADD PHOTO +"}</span>
        </label><div className="dq-photo-info"><h3>{quest.name}</h3><p>{quest.hint}</p>{photo?.matching && <p className="dq-photo-match">{photo.matching}</p>}{photo?.manualMatch && <label className="dq-stop-picker">Choose a stop (optional)<select aria-label={`Match ${quest.name} to a stop`} defaultValue="" onChange={event => update(quest.kind, { matching: event.target.value ? `Matched to ${event.target.value}` : "No photo time found · add to this day" })}><option value="">Leave unmatched</option>{day.locations.map(stop => <option key={`${stop.t}-${stop.label}`} value={`${stop.t} · ${stop.label}`}>{stop.t} · {stop.label}</option>)}</select></label>}{photo?.error && <><p className="dq-error" role="alert">{photo.error}</p>{photo.pending && <div><button type="button" className="dq-small-button" onClick={() => void upload(quest.kind, pendingFiles.current[quest.kind])}>Retry photo</button>{" "}<button type="button" className="dq-small-button" onClick={() => discardReplacement(quest.kind)}>{photo.url ? "Keep previous photo" : "Discard photo"}</button></div>}</>}</div>
      </div>; })}</div>
      {spriteUrl ? <SpritePreview url={spriteUrl} onStatusChange={setSpriteVerification} onRegenerate={() => void makeSprite()} disabled={spriteBusy || uploading || pendingChanges} retained={pendingChanges} /> : <div className="dq-sprite-status" aria-live="polite"><span className="dq-character-placeholder" aria-hidden="true">♟</span><div><strong>{spriteBusy ? "Stitching your outfit into pixels…" : "Every adventure starts with you."}</strong><span>{spriteError || "Add a front fit photo to create your character."}</span></div>{spriteError && <button type="button" className="dq-small-button" disabled={spriteBusy || pendingFitChanges} onClick={() => void makeSprite()}>Retry character</button>}</div>}
    </section>
    <div className="dq-bottom-grid"><section className="dq-panel dq-health" aria-labelledby="health-title"><span className="dq-eyebrow">03 / A LITTLE MOVEMENT</span><h2 id="health-title">Good for the soul.</h2><p className="dq-section-copy">A walk through the park belongs in your story, too.</p>{health === "done" ? <div className="dq-walk-stats"><span className="dq-walk-icon">♧</span><div><strong>AFTERNOON WALK</strong><p>{workout.distanceKm} KM <span>·</span> {workout.durationMin} MIN <span>·</span> {workout.steps.toLocaleString("en-GB")} STEPS</p></div><span>✓</span></div> : <button type="button" className="dq-health-button" disabled={health === "syncing"} onClick={() => { setHealth("syncing"); healthTimer.current = setTimeout(() => setHealth("done"), 1500); }}><span>♥</span> {health === "syncing" ? "SYNCING YOUR WALK…" : "IMPORT FROM HEALTH"}<span>+</span></button>}<p className="dq-footnote">DEMO IMPORT · SAMPLE WALK DATA</p></section>
    <section className="dq-panel dq-transport" aria-labelledby="transport-title"><span className="dq-eyebrow">04 / BETWEEN THE MOMENTS</span><h2 id="transport-title">How you got there.</h2><div className="dq-transport-list">{day.transport.map((leg, i) => <div className="dq-transport-row" key={i}><span className={`dq-line-chip ${leg.mode === "bus" ? "dq-bus" : leg.line === "Bakerloo" ? "dq-bakerloo" : "dq-central"}`}>{leg.mode === "bus" ? `BUS ${leg.route}` : leg.line}</span><span>{leg.from}<span className="dq-route-arrow"> → </span>{leg.to}</span></div>)}</div><p className="dq-footnote">AUTO-DETECTED FROM DEMO LOCATION HISTORY</p></section></div>
    <section className="dq-finish"><div><span className="dq-eyebrow">ALL THE LITTLE PIECES, ONE LITTLE WORLD.</span><h2>Ready to call it a day?</h2><p>{spriteBusy ? "Your character is being created. This can take a minute." : !photos.fit?.url ? "Add your fit check above to begin your adventure." : uploading ? "Just saving your latest memories…" : pendingChanges ? "Retry or discard your unsaved photo changes above." : spriteReady ? "Three places. One adventure. Someone to share it with." : spriteUrl ? "Your character image must load successfully before you set off. Check the preview above." : "Your character needs to be ready before you set off."}</p>{storageError && <p className="dq-error" role="alert">{storageError}</p>}</div><button type="button" className="dq-end-button" disabled={!canFinish} onClick={finishDay}>END MY DAY <span>→</span></button></section>
    </div><footer className="dq-footer"><span>MADE OF THE LITTLE THINGS.</span><span>DAYQUEST / LONDON, 2026</span></footer>
  </main>;
}
