"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DRAFT_STORAGE_KEY, NOTE_MAX_LENGTH, isReadyDraft, parseStoredDraft, type UploadKind } from "../../lib/draft";
import { discardPhotoUpload, startPhotoUpload, type Photo } from "../../lib/photo-upload";
import SpritePreview, { type SpriteVerification } from "./SpritePreview";
import { browserId } from "../../lib/browser-id";
import { sfx } from "../../lib/sound";
import Link from "next/link";
import { DEMO_FIT, DEMO_PLACES, DEMO_SPRITE, DEMO_UPLOADS, DemoRoute } from "./Demo";
import { MAX_LOCATION_FILE_BYTES, parseLocationHistory } from "../../lib/location-history";
import AppShell from "./AppShell";
import CameraButton from "./CameraButton";
import GalleryCard from "./GalleryCard";
import { useGallery } from "./useGallery";
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, matchPhoto, preparePhoto, preview , ACCEPT_ATTR, isAcceptedPhoto } from "./photo-tools";
import PixelSprite, { type SpriteName } from "./pixel";
import { DEMO_FIT_DELAY_MS, DEMO_MODE, DEMO_SPRITE_URL } from "../../lib/demo";

type Kind = Extract<UploadKind, "fit">;
const quests: { kind: Kind; name: string; sprite: SpriteName }[] = [{ kind: "fit", name: "Fit", sprite: "shirt" }];
const galleries = [
  { kind: "lunch", name: "Food", sprite: "food" },
  { kind: "landmark", name: "Place", sprite: "landmark" },
  { kind: "extra", name: "More", sprite: "flower", wide: true },
] as const;

export default function Today({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<Kind, Photo>>>(demo ? { fit: { url: DEMO_FIT.url, preview: DEMO_FIT.url } } : {});
  const [spriteUrl, setSpriteUrl] = useState<string | undefined>(demo ? DEMO_SPRITE : undefined);
  const [spriteVerification, setSpriteVerification] = useState<SpriteVerification>();
  const [spriteBusy, setSpriteBusy] = useState(false);
  const [spriteError, setSpriteError] = useState("");
  const [notes, setNotes] = useState<Partial<Record<Kind, string>>>(demo ? { fit: DEMO_FIT.note } : {});
  const [storageError, setStorageError] = useState("");
  const gallery = useGallery(sessionId);
  const [places, setPlaces] = useState<{ name: string; count: number; range: string } | undefined>(demo ? DEMO_PLACES : undefined);
  const [placesError, setPlacesError] = useState("");
  const [today, setToday] = useState<Date>();
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
  useEffect(() => {
    setToday(new Date());
    if (demo) { gallery.restore(DEMO_UPLOADS); return; }
    try {
      const draft = parseStoredDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY));
      if (draft) {
        setSessionId(draft.sessionId);
        const uploads = draft.uploads.filter(p => quests.some(quest => quest.kind === p.kind));
        uploadedUrls.current = Object.fromEntries(uploads.map(p => [p.kind, p.url]));
        setPhotos(Object.fromEntries(uploads.map(p => [p.kind, { url: p.url, preview: p.url, matching: "Saved ✓" }])));
        setNotes(Object.fromEntries(uploads.filter(p => p.note).map(p => [p.kind, p.note])));
        gallery.restore(draft.uploads);
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
      for (const request of requests.current) request.abort();
    };
  }, []);
  const savedKey = JSON.stringify(gallery.saved);
  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ sessionId, uploads: [...Object.entries(photos).filter(([, p]) => p.url).map(([kind, p]) => ({ kind, url: p.url, note: notes[kind as Kind] })), ...gallery.saved], spriteUrl }));
      setStorageError("");
    } catch { setStorageError("Your browser could not save this draft. Enable session storage to continue."); }
  }, [sessionId, photos, spriteUrl, notes, savedKey]);

  function update(kind: Kind, value: Partial<Photo>) {
    if (mounted.current) setPhotos(current => ({ ...current, [kind]: { ...current[kind], ...value } }));
  }
  // Hardcoded demo: the fit check is a scripted pause that returns the prebuilt walking character.
  function makeDemoSprite() {
    setSpriteBusy(true); setSpriteError(""); setSpriteUrl(undefined);
    const attempt = ++generation.current;
    setTimeout(() => {
      if (!mounted.current || attempt !== generation.current) return;
      setSpriteUrl(DEMO_SPRITE_URL); setSpriteBusy(false); sfx.success();
    }, DEMO_FIT_DELAY_MS);
  }
  async function makeSprite() {
    if (DEMO_MODE) { makeDemoSprite(); return; }
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
      if (mounted.current && attempt === generation.current) { setSpriteUrl(result.spriteUrl); sfx.success(); }
    } catch (error) {
      if (mounted.current && attempt === generation.current && !controller.signal.aborted) sfx.error();
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
  async function upload(kind: Kind, picked?: File) {
    if (!picked || !sessionId) return;
    if (!isAcceptedPhoto(picked)) { update(kind, { error: "Choose a photo (JPEG, PNG, WebP or HEIC)." }); return; }
    sfx.pop();
    if (DEMO_MODE) {
      // Hardcoded demo: the photo stays in this browser; only a pixel preview is shown.
      const [thumbnail, matching] = await Promise.all([preview(picked).catch(() => undefined), matchPhoto(picked)]);
      if (!thumbnail) { update(kind, { error: "We couldn't read that photo." }); return; }
      uploadedUrls.current[kind] = thumbnail;
      update(kind, { url: thumbnail, preview: thumbnail, matching, busy: false, error: undefined });
      if (kind === "fit") makeDemoSprite();
      return;
    }
    const isFit = kind === "fit";
    const attempt = (operations.current[kind] ?? 0) + 1; operations.current[kind] = attempt;
    uploadControllers.current[kind]?.abort();
    const controller = new AbortController();
    uploadControllers.current[kind] = controller;
    requests.current.add(controller);
    let succeeded = false;
    pendingFiles.current[kind] = picked;
    setPhotos(current => ({ ...current, [kind]: startPhotoUpload(current[kind]) }));
    if (isFit) {
      // Preserve the committed outfit, but invalidate any in-flight generation.
      pendingFits.current.set(kind, attempt);
      if (generationRunning.current) generationRequested.current = true;
      ++generation.current;
      generationController.current?.abort();
    }
    try {
      const file = await preparePhoto(picked);
      if (!mounted.current || operations.current[kind] !== attempt) return;
      if (file.size > MAX_PHOTO_BYTES) throw new Error("Choose an image smaller than 4 MB.");
      const [thumbnail, matching] = await Promise.all([preview(file).catch(() => undefined), matchPhoto(picked)]);
      if (!mounted.current || operations.current[kind] !== attempt) return;
      update(kind, { preview: thumbnail, matching, manualMatch: false });
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
      sfx.success();
      if (isFit) { setSpriteUrl(undefined); setSpriteError(""); }
    } catch (error) {
      if (operations.current[kind] === attempt && !controller.signal.aborted) sfx.error();
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
  async function addLocationHistory(file?: File) {
    if (!file) return;
    setPlacesError("");
    try {
      if (file.size > MAX_LOCATION_FILE_BYTES) throw new Error("That file is too large. Export a shorter range.");
      const points = parseLocationHistory(await file.text(), file.name);
      const times = points.flatMap(p => (p.t === undefined ? [] : [p.t]));
      const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const range = times.length ? (fmt(Math.min(...times)) === fmt(Math.max(...times)) ? fmt(times[0]) : `${fmt(Math.min(...times))} – ${fmt(Math.max(...times))}`) : "";
      if (!mounted.current) return;
      setPlaces({ name: file.name, count: points.length, range });
      sfx.success();
    } catch (error) {
      if (!mounted.current) return;
      setPlaces(undefined);
      setPlacesError(error instanceof Error ? error.message : "We couldn’t read that file.");
      sfx.error();
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
  const uploaded = Object.values(photos).filter(p => p.url).length + gallery.saved.length;
  const uploading = Object.values(photos).some(p => p.busy) || gallery.busy;
  const pendingChanges = Object.values(photos).some(p => p.pending) || gallery.failed;
  const pendingFitChanges = !!photos.fit?.pending;
  const spriteReady = !!spriteUrl && spriteVerification?.url === spriteUrl && spriteVerification.status === "ready";
  // all three asked-for photos (fit, food, place) must be in before the world can be made
  const have = { fit: !!photos.fit?.url, lunch: gallery.items.some(item => item.kind === "lunch" && item.url), landmark: gallery.items.some(item => item.kind === "landmark" && item.url) };
  const added = Object.values(have).filter(Boolean).length, allThree = added === 3;
  const missingNames = [!have.fit && "Fit", !have.lunch && "Food", !have.landmark && "Place"].filter(Boolean).join(" and ");
  const canFinish = allThree && spriteReady && !pendingChanges && !uploading && !spriteBusy && !storageError;
  function finishDay() {
    if (!canFinish || Object.keys(pendingFiles.current).length || generationRunning.current) return;
    if (DEMO_MODE) { sfx.fanfare(); router.push("/generating"); return; }
    const draft = {
      sessionId,
      uploads: [...Object.entries(uploadedUrls.current).map(([kind, url]) => ({ kind, url, note: notes[kind as Kind] })), ...gallery.saved],
      spriteUrl,
    };
    if (!isReadyDraft(draft)) return;
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setStorageError("");
      sfx.fanfare();
      router.push("/generating");
    } catch {
      setStorageError("Your browser could not save this draft. Enable session storage to continue.");
    }
  }
  const finishHint = !allThree && !spriteBusy ? `${added} of 3 photos added · add your ${missingNames} photo` : spriteBusy ? "Making your character…" : !photos.fit?.url ? "Add your fit to begin" : uploading ? "Saving…" : pendingChanges ? "Retry or remove failed photos" : spriteReady ? "All set!" : spriteUrl ? "Check your character preview" : "Waiting for your character";
  return <AppShell active={demo ? "demo" : "try"}>
    <section className="dq-card dq-card-pink" aria-labelledby="photos-title">
      <div className="dq-quest-head">
        <div className="dq-quest-title"><span className="dq-date">{today ? today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}</span><h1 id="photos-title">{demo ? "Lucas · sample day" : "Your day"}</h1><p className="dq-subtitle">{demo ? "A sample made with demo photos." : "What did today look like?"}</p></div>
        <span className="dq-chip dq-chip-pink" aria-label={`${uploaded} photos added`}>{uploaded} {uploaded === 1 ? "photo" : "photos"}</span>
      </div>
      <div className="dq-photo-grid">{quests.map(quest => { const photo = photos[quest.kind]; return <div className={`dq-photo-card dq-photo-${quest.kind} ${photo?.url ? "is-uploaded" : ""}`} key={quest.kind} style={!photo?.url && !demo ? { outline: "3px dashed #f2759b", outlineOffset: 3 } : undefined}>
        <div className="dq-photo-head"><h3>{quest.name}</h3>{!demo && <CameraButton label={`Take a photo for ${quest.name}`} disabled={!sessionId} onFile={file => void upload(quest.kind, file)} />}</div>
        <label className="dq-upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(quest.kind, event.dataTransfer.files[0]); }}>
          <input type="file" accept={ACCEPT_ATTR} aria-label={`Upload ${quest.name}`} disabled={!sessionId} onChange={event => { void upload(quest.kind, event.target.files?.[0]); event.target.value = ""; }}/>
          {photo?.url && <span className="dq-upload-check" aria-label="Uploaded">✓</span>}
          {photo?.preview ? <img src={photo.preview} alt={`${quest.name} pixel preview`} className="dq-photo-preview"/> : <PixelSprite name={quest.sprite} size={6} className="dq-photo-sprite"/>}
          {!demo && <span className="dq-photo-action">{photo?.busy ? "Saving…" : photo?.preview ? "Swap" : "+ Add"}</span>}
        </label>
        {(photo?.preview || photo?.error) && <div className="dq-photo-info">
          {photo?.preview && <input type="text" className="dq-caption" maxLength={NOTE_MAX_LENGTH} placeholder="Add a note" aria-label={`Note about ${quest.name}`} value={notes[quest.kind] ?? ""} readOnly={demo} onChange={event => setNotes(current => ({ ...current, [quest.kind]: event.target.value }))}/>}
          {photo?.error && <><p className="dq-error" role="alert">{photo.error}</p>{photo.pending && <div className="dq-actions"><button type="button" className="dq-small-button" onClick={() => void upload(quest.kind, pendingFiles.current[quest.kind])}>Retry</button><button type="button" className="dq-small-button" onClick={() => discardReplacement(quest.kind)}>{photo.url ? "Keep old" : "Discard"}</button></div>}</>}
        </div>}
      </div>; })}
        {galleries.map(g => <GalleryCard key={g.kind} missing={g.kind !== "extra" && !have[g.kind] && !demo} title={g.name} sprite={g.sprite} kind={g.kind} wide={"wide" in g} readOnly={demo} ready={!!sessionId} items={gallery.items.filter(item => item.kind === g.kind)} onAdd={files => gallery.add(g.kind, files)} onRemove={gallery.remove} onRetry={gallery.retry} onNote={gallery.setNote} />)}
      </div>
      {!demo && <p className="dq-cta-hint">The first Place and Food photos anchor your world. Other photos and notes add context.</p>}
      {gallery.notice && <p className="dq-error" role="alert">{gallery.notice}</p>}
      {!allThree && <div className="dq-sprite-status" aria-live="polite"><PixelSprite name="face" size={4}/><div><strong>{added} of 3 photos added</strong><span>Add your {missingNames} photo to get your adventure ready.</span></div></div>}
      <div hidden={!allThree}>{spriteUrl ? <SpritePreview url={spriteUrl} onStatusChange={setSpriteVerification} onRegenerate={() => void makeSprite()} disabled={demo || spriteBusy || uploading || pendingChanges} retained={pendingChanges} /> : <div className="dq-sprite-status" aria-live="polite"><PixelSprite name="face" size={4} className={spriteBusy ? "dq-hop" : undefined}/><div><strong>{spriteBusy ? "Making your character…" : "Your character"}</strong><span>{spriteError || (spriteBusy ? "Just a minute" : "Add a fit photo to start")}</span></div>{spriteError && <button type="button" className="dq-small-button" disabled={spriteBusy || pendingFitChanges} onClick={() => void makeSprite()}>Retry</button>}</div>}</div>
      <div className="dq-places">
        <PixelSprite name="pin" size={4}/>
        <div><strong>Location history</strong><span className={placesError ? "dq-error" : undefined} role={placesError ? "alert" : undefined}>{placesError || (places ? `${places.count.toLocaleString("en-GB")} places${places.range ? ` · ${places.range}` : ""}` : "Google Timeline JSON or GPX")}</span></div>
        {places && !demo && <button type="button" className="dq-small-button" onClick={() => setPlaces(undefined)}>Remove</button>}
        {!demo && <label className={`dq-small-button dq-file-button ${places ? "is-done" : ""}`}>{places ? "Replace" : "+ Add file"}<input type="file" accept=".json,.gpx,application/json,application/gpx+xml,text/xml" aria-label="Upload location history" onChange={event => { void addLocationHistory(event.target.files?.[0]); event.target.value = ""; }}/></label>}
      </div>
      {places && !demo && <p className="dq-cta-hint">Location history is previewed here. It is not used to build your world yet.</p>}
      {demo && <DemoRoute />}
    </section>
    {demo ? <div className="dq-cta"><button type="button" className="dq-big-button" onClick={() => { sfx.fanfare(); router.push("/generating?demo=1"); }}>Create my world <PixelSprite name="star" size={1.5}/></button><Link href="/" className="dq-small-button">Try it with your photos</Link></div> : <div className="dq-cta"><p className="dq-cta-hint" aria-live="polite">{finishHint}</p>{storageError && <p className="dq-error" role="alert">{storageError}</p>}<button type="button" className="dq-big-button" disabled={!canFinish} onClick={finishDay}>Create my world <PixelSprite name="star" size={1.5}/></button></div>}
  </AppShell>;
}
