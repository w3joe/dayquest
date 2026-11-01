"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOADS_PER_KIND } from "../../lib/draft";
import { sfx } from "../../lib/sound";
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, matchPhoto, preparePhoto, preview } from "./photo-tools";

export type GalleryKind = "lunch" | "landmark" | "extra";
export const GALLERY_KINDS: GalleryKind[] = ["lunch", "landmark", "extra"];
export type GalleryItem = { id: string; kind: GalleryKind; preview?: string; url?: string; note: string; matching?: string; busy?: boolean; error?: string };

/** Food, place and "anything else" photos: any number per slot, each with its own note. */
export function useGallery(sessionId: string) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [notice, setNotice] = useState("");
  const itemsRef = useRef<GalleryItem[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const counter = useRef(0);
  itemsRef.current = items;

  useEffect(() => {
    mounted.current = true;
    const live = controllers.current;
    return () => { mounted.current = false; for (const controller of live.values()) controller.abort(); };
  }, []);

  const patch = useCallback((id: string, value: Partial<GalleryItem>) => {
    if (mounted.current) setItems(current => current.map(item => (item.id === id ? { ...item, ...value } : item)));
  }, []);

  const send = useCallback(async (id: string, kind: GalleryKind, file: File) => {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    patch(id, { busy: true, error: undefined });
    try {
      const form = new FormData(); form.set("photo", file); form.set("kind", kind); form.set("sessionId", sessionId);
      const response = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Upload failed. Please try again.");
      files.current.delete(id);
      patch(id, { url: result.url, busy: false });
      sfx.success();
    } catch (error) {
      if (!controller.signal.aborted) { patch(id, { busy: false, error: error instanceof Error ? error.message : "Upload failed. Please try again." }); sfx.error(); }
    } finally { controllers.current.delete(id); }
  }, [patch, sessionId]);

  const add = useCallback((kind: GalleryKind, list: FileList | File[] | null | undefined) => {
    const picked = Array.from(list ?? []);
    if (!picked.length || !sessionId) return;
    const room = MAX_UPLOADS_PER_KIND - itemsRef.current.filter(item => item.kind === kind).length;
    const usable = picked.filter(file => ACCEPTED_TYPES.includes(file.type));
    setNotice(usable.length < picked.length ? "Photos must be JPEG, PNG or WebP." : picked.length > room ? `Up to ${MAX_UPLOADS_PER_KIND} photos here.` : "");
    const chosen = usable.slice(0, Math.max(0, room));
    if (!chosen.length) return;
    sfx.pop();
    const created = chosen.map(file => ({ file, item: { id: `g${++counter.current}`, kind, note: "", busy: true } as GalleryItem }));
    setItems(current => [...current, ...created.map(entry => entry.item)]);
    for (const { file, item } of created) {
      void (async () => {
        const [prepared, matching] = await Promise.all([preparePhoto(file), matchPhoto(file)]);
        if (prepared.size > MAX_PHOTO_BYTES) { patch(item.id, { busy: false, error: "That photo is too large." }); return; }
        files.current.set(item.id, prepared);
        void preview(prepared).then(thumb => patch(item.id, { preview: thumb, matching })).catch(() => patch(item.id, { matching }));
        void send(item.id, kind, prepared);
      })();
    }
  }, [patch, send, sessionId]);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    files.current.delete(id);
    setItems(current => current.filter(item => item.id !== id));
  }, []);
  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find(entry => entry.id === id), file = files.current.get(id);
    if (item && file) void send(id, item.kind, file);
  }, [send]);
  const setNote = useCallback((id: string, note: string) => patch(id, { note }), [patch]);
  const restore = useCallback((saved: { kind: string; url: string; note?: string }[]) => {
    setItems(saved.filter(entry => (GALLERY_KINDS as string[]).includes(entry.kind)).map(entry => ({ id: `g${++counter.current}`, kind: entry.kind as GalleryKind, url: entry.url, preview: entry.url, note: entry.note ?? "", matching: "Saved ✓" })));
  }, []);

  return {
    items, notice, add, remove, retry, setNote, restore,
    busy: items.some(item => item.busy),
    failed: items.some(item => item.error && !item.busy),
    saved: items.filter(item => item.url).map(item => ({ kind: item.kind, url: item.url as string, note: item.note || undefined })),
  };
}
