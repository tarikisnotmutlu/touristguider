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
  /** Bumped to force the map layer to rebuild from scratch (used by "reset to auto"). */
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
}

export interface Trip {
  id: string;
  title: string;
  friendName?: string;
  days: Day[];
  hiddenGems: HiddenGem[];
}
