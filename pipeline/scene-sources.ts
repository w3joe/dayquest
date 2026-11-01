import type { DayScene } from "../lib/day";
import type { UploadKind } from "./types";

const PLACE_KINDS = ["landmark", "lunch", "park", "extra"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type SceneUnit = { id: string; kind: DayScene["kind"]; photoKind: PlaceKind; bytes?: Buffer; note?: string };

export function sceneKindFor(kind: PlaceKind): DayScene["kind"] {
  return kind === "lunch" ? "meal" : kind === "park" ? "park" : "tourist";
}

function isPlacePhoto<T extends { kind: UploadKind }>(photo: T): photo is T & { kind: PlaceKind } {
  return (PLACE_KINDS as readonly string[]).includes(photo.kind);
}

/** Fit photos stay with the character. Every other uploaded picture becomes one explorable scene, in upload order. */
export function sceneUnits(input: {
  photos?: { kind: UploadKind; bytes: Buffer; note?: string }[];
  uploads: Partial<Record<UploadKind, Buffer>>;
}): SceneUnit[] {
  const listed = (input.photos ?? []).filter(isPlacePhoto);
  const ordered = listed.length
    ? listed
    : PLACE_KINDS.flatMap(kind => {
      const bytes = input.uploads[kind];
      return bytes ? [{ kind, bytes }] : [];
    });
  if (!ordered.length) return [{ id: "scene_1", kind: "tourist", photoKind: "landmark" }];
  return ordered.map((photo, index) => {
    const unit: SceneUnit = { id: `scene_${index + 1}`, kind: sceneKindFor(photo.kind), photoKind: photo.kind };
    if (photo.bytes) unit.bytes = photo.bytes;
    if ("note" in photo && typeof photo.note === "string" && photo.note) unit.note = photo.note;
    return unit;
  });
}
