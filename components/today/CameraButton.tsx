import { ACCEPT_ATTR } from "./photo-tools";
import PixelSprite from "./pixel";

/** Opens the camera directly. Shown on touch devices only; the main picker still offers the photo library. */
export default function CameraButton({ label, disabled, onFile }: { label: string; disabled?: boolean; onFile: (file?: File) => void }) {
  return <label className="dq-camera">
    <input type="file" accept={ACCEPT_ATTR} capture="environment" aria-label={label} disabled={disabled} onChange={event => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
    <PixelSprite name="camera" size={2} />
  </label>;
}
