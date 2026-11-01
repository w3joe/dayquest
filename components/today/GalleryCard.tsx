import { ACCEPT_ATTR } from "./photo-tools";
import { NOTE_MAX_LENGTH, MAX_UPLOADS_PER_KIND } from "../../lib/draft";
import CameraButton from "./CameraButton";
import PixelSprite, { type SpriteName } from "./pixel";
import type { GalleryItem } from "./useGallery";

type Props = {
  title: string; sprite: SpriteName; kind: string; items: GalleryItem[]; ready: boolean; wide?: boolean; readOnly?: boolean;
  onAdd: (files: FileList | File[] | null) => void; onRemove: (id: string) => void; onRetry: (id: string) => void; onNote: (id: string, note: string) => void;
};

/** A photo slot that takes any number of photos, each with its own note. */
export default function GalleryCard({ title, sprite, kind, items, ready, wide, readOnly, onAdd, onRemove, onRetry, onNote, missing }: Props & { missing?: boolean }) {
  const picker = (label: string, className: string, children: React.ReactNode) => <label className={className} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onAdd(event.dataTransfer.files); }}>
    <input type="file" multiple accept={ACCEPT_ATTR} aria-label={label} disabled={!ready} onChange={event => { onAdd(event.target.files); event.target.value = ""; }} />
    {children}
  </label>;
  return <div className={`dq-photo-card dq-gallery dq-photo-${kind} ${wide ? "is-wide" : ""}`} style={missing ? { outline: "3px dashed #f2759b", outlineOffset: 3 } : undefined}>
    <div className="dq-photo-head"><div className="dq-gallery-title"><h3>{title}</h3>{items.length > 0 && <span className="dq-count">{items.length}</span>}</div>{!readOnly && <CameraButton label={`Take a ${title} photo`} disabled={!ready} onFile={file => onAdd(file ? [file] : null)} />}</div>
    {items.length === 0
      ? picker(`Upload ${title} photos`, "dq-upload-zone", <><PixelSprite name={sprite} size={6} className="dq-photo-sprite" /><span className="dq-photo-action">+ Add</span></>)
      : <div className="dq-tiles">{items.map(item => <div className="dq-tile" key={item.id}>
        <div className="dq-tile-image">
          {item.preview ? <img src={item.preview} alt={`${title} photo`} /> : <PixelSprite name={sprite} size={3} />}
          {!readOnly && <button type="button" className="dq-tile-remove" aria-label={`Remove ${title} photo`} onClick={() => onRemove(item.id)}>✕</button>}
          {item.busy && <span className="dq-tile-busy">Saving…</span>}{item.url && !item.busy && <span className="dq-tile-ok" aria-label="Saved">✓</span>}
        </div>
        <input type="text" className="dq-caption" maxLength={NOTE_MAX_LENGTH} placeholder="Add a note" aria-label={`Note about this ${title} photo`} value={item.note} readOnly={readOnly} onChange={event => onNote(item.id, event.target.value)} />
        {item.error && <p className="dq-error" role="alert">{item.error} <button type="button" className="dq-link-button" onClick={() => onRetry(item.id)}>Retry</button></p>}
      </div>)}
        {!readOnly && items.length < MAX_UPLOADS_PER_KIND && picker(`Add more ${title} photos`, "dq-tile dq-tile-add", <><span className="dq-tile-plus">+</span><span>Add</span></>)}
      </div>}
  </div>;
}
