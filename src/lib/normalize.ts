import type { Day, RouteSegment, Step, Trip } from "./types";
import { normalizeTransportMode } from "./transport";

function normalizeStep(step: Step): Step {
  return {
    ...step,
    category: step.category ?? "other",
    completed: step.completed ?? false,
    checklist: step.checklist ?? [],
    notes: step.notes ?? "",
  };
}

function normalizeRoute(route: RouteSegment): RouteSegment {
  return {
    ...route,
    mode: normalizeTransportMode(route.mode),
    manualWaypoints: route.manualWaypoints ?? [],
    geometry: route.geometry ?? [],
    resetNonce: route.resetNonce ?? 0,
  };
}

function normalizeDay(day: Day): Day {
  return {
    ...day,
    steps: (day.steps ?? []).map(normalizeStep),
    routes: (day.routes ?? []).map(normalizeRoute),
  };
}

/** Fills in defaults for fields added after a trip may have been created/saved,
 *  so older shared links and persisted blobs keep working without a migration step. */
export function normalizeTrip(trip: Trip): Trip {
  return {
    ...trip,
    days: (trip.days ?? []).map(normalizeDay),
    hiddenGems: trip.hiddenGems ?? [],
    unplanned: trip.unplanned ?? [],
  };
}
