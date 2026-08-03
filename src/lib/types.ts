import type { PlaceCategory } from "./categories";

export type TransportMode = "walk" | "drive" | "transit" | "ferry";

/** Modes we can actually route via OSRM road networks. Transit/ferry get a
 *  schematic straight line instead — there's no free transit-routing API. */
export const ROUTABLE_MODES: TransportMode[] = ["walk", "drive"];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface Step {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  /** Minutes the visitor plans to spend at this stop. */
  durationMin: number;
  notes: string;
  checklist: ChecklistItem[];
  /** Marked done as the visitor works through the day. */
  completed: boolean;
  /** Computed by the time-recalculation engine, not user-edited directly. */
  arrival?: string;
  departure?: string;
}

export interface RouteSegment {
  mode: TransportMode;
  /** Meters. Null until an estimate/route has been computed at least once. */
  distanceM: number | null;
  /** Minutes. Null until an estimate/route has been computed at least once. */
  durationMin: number | null;
  /** True once the user has dragged the route line to add custom waypoints. */
  isManual: boolean;
  /** Via points the user dragged in, in order, between the segment's two endpoints. */
  manualWaypoints: LatLng[];
  /** Last known route geometry, kept for non-routable (transit) segments. */
  geometry: LatLng[];
  /** True once `geometry` reflects a real OSRM street-hugging fetch for this
   *  exact pair of endpoints (routable modes only — transit/ferry are always
   *  "resolved" since their straight-line schematic IS the final answer).
   *  While false, MapView deliberately renders no line for this segment
   *  rather than a straight-line placeholder — see MapView's route-sync
   *  effect. */
  geometryResolved: boolean;
  /** True once MapView's fetch effect has given up retrying OSRM for now
   *  (still retrying in the background) and written a straight-line
   *  distance estimate instead of leaving the segment a permanent gap.
   *  Rendered in a visually distinct "degraded" style so it's never
   *  mistaken for a real, OSRM-resolved route. */
  geometryDegraded?: boolean;
  /** Bumped to force the map layer to rebuild from scratch (used by "reset to
   *  auto" and when the segment's transport mode changes). */
  resetNonce: number;
  /** User-entered line/route name for a "transit" segment, e.g. "M2 Metro to Taksim". */
  transitLine?: string;
}

export interface Day {
  id: string;
  label: string;
  date?: string;
  startTime: string; // "HH:MM"
  startPoint: { name: string; lat: number; lng: number };
  steps: Step[];
  /** routes[i] connects (i === 0 ? startPoint : steps[i-1]) -> steps[i]. Same length as steps. */
  routes: RouteSegment[];
}

export interface HiddenGem {
  id: string;
  lat: number;
  lng: number;
  note: string;
  createdAt: number;
  /** When true (the default), the reveal only happens once the visitor is
   *  physically within range — a scavenger-hunt pin rather than a plain one. */
  geoLocked: boolean;
  /** Trip-creator-only label for telling gems apart while editing — never
   *  shown to the visitor, who only ever sees the generic ✨ pin. */
  name?: string;
  /** Geo-lock trigger distance in meters. Falls back to a shared default
   *  (see GEM_UNLOCK_RADIUS_M) for gems saved before this field existed. */
  radiusM?: number;
  /** Shown at the top of the discovery reveal when set, postcard-style — a
   *  Firebase Storage downloadURL from the Admin Hidden Gem Studio's native
   *  file upload (gems/{sessionId}/{filename}). */
  imageUrl?: string;
}

/** A saved place with no day/time slot yet — lives in the "Unplanned" tab
 *  until dragged/assigned onto a specific day. */
export interface UnplannedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  notes: string;
}

export interface Trip {
  id: string;
  title: string;
  days: Day[];
  hiddenGems: HiddenGem[];
  unplanned: UnplannedPlace[];
}
