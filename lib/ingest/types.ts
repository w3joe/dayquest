/** Normalised day, a superset of data/input.json (SPEC §4.1). Extra fields are optional so existing consumers keep working. */
export type Stop = { t: string; lat: number; lng: number; label: string; dwellMin?: number; source?: "timeline" | "photo" | "gpx" };
export type TransportLeg =
  | { from: string; to: string; mode: "bus"; route: string; destination?: string; via?: string[]; routeSource?: "tfl" | "hint" }
  | { from: string; to: string; mode: "tube"; line: string; stations: string[] };
export type Workout = { t: string; type: string; distanceKm: number; durationMin: number; steps?: number; source: "health" | "gpx"; route?: { lat: number; lng: number }[] };
export type PhotoRef = { path: string; t: string; note: string; lat?: number; lng?: number; stopIndex?: number };

export type DayInput = {
  user: { name: string; fitCheckPhoto?: string; fitCheckBackPhoto?: string };
  date: string;
  locations: Stop[];
  transport: TransportLeg[];
  photos: PhotoRef[];
  workouts: Workout[];
  notes: string;
};

export type HighlightKind = "tourist" | "meal" | "park";
export type NearbyLandmark = { title: string; lat: number; lng: number; distanceM: number; summary?: string; image?: string };
export type Candidate = { kind: HighlightKind; stopIndex: number; label: string; score: number; landmarks: NearbyLandmark[]; detail?: string };

export type IngestResult = { input: DayInput; candidates: Candidate[]; warnings: string[] };

/** Everything that needs the network sits behind this interface so parsing and assembly are testable offline. */
export type PlaceInfo = { name?: string; kind: HighlightKind | "other"; detail?: string };
export type Lookups = {
  label(lat: number, lng: number): Promise<string | undefined>;
  place(lat: number, lng: number): Promise<PlaceInfo | undefined>;
  landmarks(lat: number, lng: number): Promise<NearbyLandmark[]>;
  transit(from: Stop, to: Stop, mode: "bus" | "tube", whenIso: string): Promise<TransportLeg[] | undefined>;
};
