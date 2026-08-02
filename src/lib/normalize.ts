import type { Day, HiddenGem, RouteSegment, Step, Trip } from "./types";
import { ROUTABLE_MODES } from "./types";
import { normalizeTransportMode } from "./transport";

function normalizeGem(gem: HiddenGem): HiddenGem {
  return { ...gem, geoLocked: gem.geoLocked ?? true };
}

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
  const geometry = route.geometry ?? [];
  const mode = normalizeTransportMode(route.mode);
  return {
    ...route,
    mode,
    manualWaypoints: route.manualWaypoints ?? [],
    geometry,
    // Trips saved before this field existed: transit/ferry never had an
    // OSRM fetch to wait for, so their straight line was always the final
    // answer. For walk/drive, a geometry with more than the two straight
    // endpoints could only have come from a real OSRM fetch — anything
    // shorter needs a fresh fetch before MapView will render it.
    geometryResolved: route.geometryResolved ?? (!ROUTABLE_MODES.includes(mode) || geometry.length > 2),
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
    hiddenGems: (trip.hiddenGems ?? []).map(normalizeGem),
    unplanned: trip.unplanned ?? [],
  };
}
