"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOADS, MAX_UPLOADS_PER_KIND } from "../../lib/draft";
import { sfx } from "../../lib/sound";
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, matchPhoto, preparePhoto, preview } from "./photo-tools";
import { DEMO_MODE } from "../../lib/demo";

export type GalleryKind = "lunch" | "landmark" | "extra";
export const GALLERY_KINDS: GalleryKind[] = ["lunch", "landmark", "extra"];
export type GalleryItem = { id: string; kind: GalleryKind; preview?: string; url?: string; note: string; matching?: string; busy?: boolean; error?: string };

/** Gallery uploads reserve room immediately, including while photos are being prepared. */
export function useGallery(sessionId: string) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [notice, setNotice] = useState("");
  const itemsRef = useRef<GalleryItem[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const counter = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const live = controllers.current;
    return () => { mounted.current = false; for (const controller of live.values()) controller.abort(); };
  }, []);

  const commit = useCallback((next: GalleryItem[]) => {
    itemsRef.current = next;
    if (mounted.current) setItems(next);
  }, []);
  const patch = useCallback((id: string, value: Partial<GalleryItem>) => {
    if (mounted.current) commit(itemsRef.current.map(item => item.id === id ? { ...item, ...value } : item));
  }, [commit]);

  const send = useCallback(async (id: string, kind: GalleryKind, original: File) => {
    controllers.current.get(id)?.abort();
    const controller = new AbortController();
    controllers.current.set(id, controller);
    const current = () => mounted.current && !controller.signal.aborted && controllers.current.get(id) === controller && itemsRef.current.some(item => item.id === id);
    patch(id, { busy: true, error: undefined });
    try {
      const [file, matching] = await Promise.all([preparePhoto(original), matchPhoto(original)]);
      if (!current()) return;
      if (file.size > MAX_PHOTO_BYTES) throw new Error("That photo is too large. Choose a smaller photo.");
      const thumbnail = await preview(file).catch(() => undefined);
      if (!current()) return;
      patch(id, { preview: thumbnail, matching });
      if (DEMO_MODE) {
        // Hardcoded demo: the photo stays in this browser; the pixel preview stands in for the upload.
        if (!thumbnail) throw new Error("We couldn't read that photo.");
        files.current.delete(id);
        patch(id, { url: thumbnail, busy: false });
        sfx.success();
        return;
      }
      const form = new FormData(); form.set("photo", file); form.set("kind", kind); form.set("sessionId", sessionId);
      const response = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Upload failed. Please try again.");
      if (!current()) return;
      files.current.delete(id);
      patch(id, { url: result.url, busy: false });
      sfx.success();
    } catch (error) {
      if (current()) { patch(id, { busy: false, error: error instanceof Error ? error.message : "Upload failed. Please try again." }); sfx.error(); }
    } finally {
      if (controllers.current.get(id) === controller) controllers.current.delete(id);
    }
  }, [patch, sessionId]);

  const add = useCallback((kind: GalleryKind, list: FileList | File[] | null | undefined) => {
    const picked = Array.from(list ?? []);
    if (!picked.length || !sessionId || !mounted.current) return;
    // Reserve one of the shared draft's 30 slots for the character photo.
    const room = Math.max(0, Math.min(MAX_UPLOADS_PER_KIND - itemsRef.current.filter(item => item.kind === kind).length, MAX_UPLOADS - 1 - itemsRef.current.length));
    const usable = picked.filter(file => ACCEPTED_TYPES.includes(file.type));
    setNotice(usable.length < picked.length ? "Photos must be JPEG, PNG or WebP." : usable.length > room ? `Up to ${MAX_UPLOADS_PER_KIND} photos per group and ${MAX_UPLOADS} photos in total.` : "");
    const chosen = usable.slice(0, room);
    if (!chosen.length) return;
    sfx.pop();
    const created = chosen.map(file => ({ file, item: { id: `g${++counter.current}`, kind, note: "", busy: true } as GalleryItem }));
    commit([...itemsRef.current, ...created.map(entry => entry.item)]);
    for (const { file, item } of created) {
      files.current.set(item.id, file);
      void send(item.id, kind, file);
    }
  }, [commit, send, sessionId]);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    files.current.delete(id);
    commit(itemsRef.current.filter(item => item.id !== id));
  }, [commit]);
  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find(entry => entry.id === id), file = files.current.get(id);
    if (item && file) void send(id, item.kind, file);
  }, [send]);
  const setNote = useCallback((id: string, note: string) => patch(id, { note }), [patch]);
  const restore = useCallback((saved: { kind: string; url: string; note?: string }[]) => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear(); files.current.clear();
    commit(saved.filter(entry => (GALLERY_KINDS as string[]).includes(entry.kind)).map(entry => ({ id: `g${++counter.current}`, kind: entry.kind as GalleryKind, url: entry.url, preview: entry.url, note: entry.note ?? "", matching: "Saved ✓" })));
  }, [commit]);

  return {
    items, notice, add, remove, retry, setNote, restore,
    busy: items.some(item => item.busy),
    failed: items.some(item => item.error && !item.busy),
    saved: items.filter(item => item.url).map(item => ({ kind: item.kind, url: item.url as string, note: item.note || undefined })),
  };
}
