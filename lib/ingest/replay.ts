import type { Lookups, NearbyLandmark, PlaceInfo, Stop, TransportLeg } from "./types";

export type RecordedLookups = {
  labels: Record<string, string>;
  places: Record<string, PlaceInfo>;
  landmarks: Record<string, NearbyLandmark[]>;
  transit: Record<string, TransportLeg[]>;
};

const key = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/** Serves recorded answers through the same `Lookups` interface the live OSM/Wikipedia/TfL code uses, so a demo package ingests offline. */
export function replayLookups(recorded: RecordedLookups): Lookups {
  return {
    label: async (lat, lng) => recorded.labels[key(lat, lng)],
    place: async (lat, lng) => recorded.places[key(lat, lng)],
    landmarks: async (lat, lng) => recorded.landmarks[key(lat, lng)] ?? [],
    transit: async (from: Stop, to: Stop, mode) => recorded.transit[`${mode}:${key(from.lat, from.lng)}>${key(to.lat, to.lng)}`],
  };
}
