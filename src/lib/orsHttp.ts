import type { LatLng, TransportMode } from "./types";
import { estimateDurationMin, haversineMeters } from "./geo";

/**
 * OpenRouteService directions API — replaces the old free OSRM community
 * servers with a proper, quota-metered routing service. `foot-walking` is
 * the primary profile (this is a pedestrian-first exploration app);
 * `driving-car` covers the "drive" transport mode the same way OSRM's
 * routed-car profile used to. Requires NEXT_PUBLIC_ORS_API_KEY (see
 * openrouteservice.org/dev/#/signup).
 */
const ORS_PROFILE: Partial<Record<TransportMode, string>> = {
  walk: "foot-walking",
  drive: "driving-car",
};

export interface RouteResult {
  distanceM: number;
  durationMin: number;
  geometry: LatLng[];
}

function straightLineRoute(waypoints: LatLng[], mode: TransportMode): RouteResult {
  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    distanceM += haversineMeters(waypoints[i - 1], waypoints[i]);
  }
  return { distanceM, durationMin: estimateDurationMin(distanceM, mode), geometry: waypoints };
}

/**
 * Fetches a route through `waypoints` (in order: from, ...manual via points,
 * to) for the given mode via ORS's POST .../directions/{profile}/geojson
 * endpoint — the POST form (rather than a GET string-of-coordinates URL) is
 * what lets an arbitrary number of dragged-in waypoints go through in one
 * request. For a non-routable mode (or a degenerate <2-point input) the
 * straight line IS the correct, final answer. For a routable mode, any ORS
 * failure (network error, non-2xx, quota exceeded, unroutable coordinates,
 * empty result) REJECTS rather than falling back — the caller (see
 * tripSync.ts) is the one place allowed to fall back to a straight line, so
 * that estimate is always clearly marked `geometryDegraded` rather than
 * silently mistaken for a real street-hugging route.
 */
export async function fetchRoute(
  waypoints: LatLng[],
  mode: TransportMode,
  signal?: AbortSignal
): Promise<RouteResult> {
  const profile = ORS_PROFILE[mode];
  if (!profile || waypoints.length < 2) return straightLineRoute(waypoints, mode);

  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_ORS_API_KEY is not set");

  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    // ORS's coordinates are [lng, lat] pairs — the same order MapLibre uses,
    // so this is a direct map over our {lat,lng} waypoints, no axis-swap bug
    // to worry about at the call site.
    body: JSON.stringify({ coordinates: waypoints.map((p) => [p.lng, p.lat]) }),
    signal,
  });
  if (!res.ok) throw new Error(`ORS request failed: ${res.status}`);

  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature) throw new Error("ORS returned no route");

  const geometry: LatLng[] = (feature.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => ({ lat, lng })
  );
  if (geometry.length === 0) throw new Error("ORS returned an empty geometry");

  const summary = feature.properties?.summary;
  if (!summary) throw new Error("ORS returned no route summary");

  return {
    distanceM: summary.distance,
    durationMin: summary.duration / 60,
    geometry,
  };
}
