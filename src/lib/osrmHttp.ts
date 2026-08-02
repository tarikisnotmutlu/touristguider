import type { LatLng, TransportMode } from "./types";
import { estimateDurationMin, haversineMeters } from "./geo";

/**
 * Free, no-signup OSRM instances run by the OpenStreetMap.de community. Unlike the
 * public router.project-osrm.org demo (driving only), these expose foot/car
 * profiles, which is what lets us route walking legs too.
 *
 * These are best-effort community servers with no uptime SLA. `fetchRoute` used
 * to quietly degrade to a straight-line estimate on any failure — that straight
 * line is exactly the "route ignores the street grid" bug callers need to avoid,
 * so it now throws instead and leaves retrying to the caller (see MapView's
 * route-fetch effect, which retries on a timer rather than ever accepting a
 * straight line for a routable segment).
 */
const OSRM_BASE: Partial<Record<TransportMode, { serviceUrl: string; profile: string }>> = {
  walk: { serviceUrl: "https://routing.openstreetmap.de/routed-foot", profile: "foot" },
  drive: { serviceUrl: "https://routing.openstreetmap.de/routed-car", profile: "car" },
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
 * Fetches a route through `waypoints` (in order: from, ...via, to) for the given
 * mode. For a non-routable mode (or a degenerate <2-point input) the straight
 * line IS the correct, final answer, so that resolves normally. For a routable
 * mode (walk/drive), any OSRM failure — network error, non-2xx, empty result —
 * REJECTS rather than falling back, so the caller never mistakes a straight
 * line for a real street-hugging route.
 */
export async function fetchRoute(
  waypoints: LatLng[],
  mode: TransportMode,
  signal?: AbortSignal
): Promise<RouteResult> {
  const endpoint = OSRM_BASE[mode];
  if (!endpoint || waypoints.length < 2) return straightLineRoute(waypoints, mode);

  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${endpoint.serviceUrl}/route/v1/${endpoint.profile}/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM request failed: ${res.status}`);
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) throw new Error("OSRM returned no route");
  const geometry: LatLng[] = (route.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => ({ lat, lng })
  );
  if (geometry.length === 0) throw new Error("OSRM returned an empty geometry");
  return {
    distanceM: route.distance,
    durationMin: route.duration / 60,
    geometry,
  };
}
