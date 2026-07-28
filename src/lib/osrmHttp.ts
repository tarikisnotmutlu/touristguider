import type { LatLng, TransportMode } from "./types";
import { estimateDurationMin, haversineMeters } from "./geo";

/**
 * Free, no-signup OSRM instances run by the OpenStreetMap.de community. Unlike the
 * public router.project-osrm.org demo (driving only), these expose foot/bike/car
 * profiles, which is what lets us route walking and cycling legs too.
 *
 * These are best-effort community servers with no uptime SLA — every caller of
 * `fetchRoute` should be ready to fall back to a straight-line estimate on failure.
 */
const OSRM_BASE: Partial<Record<TransportMode, { serviceUrl: string; profile: string }>> = {
  walk: { serviceUrl: "https://routing.openstreetmap.de/routed-foot", profile: "foot" },
  cycle: { serviceUrl: "https://routing.openstreetmap.de/routed-bike", profile: "bike" },
  drive: { serviceUrl: "https://routing.openstreetmap.de/routed-car", profile: "car" },
};

export interface RouteResult {
  distanceM: number;
  durationMin: number;
  geometry: LatLng[];
}

function fallbackRoute(waypoints: LatLng[], mode: TransportMode): RouteResult {
  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    distanceM += haversineMeters(waypoints[i - 1], waypoints[i]);
  }
  return { distanceM, durationMin: estimateDurationMin(distanceM, mode), geometry: waypoints };
}

/**
 * Fetches a route through `waypoints` (in order: from, ...via, to) for the given
 * mode. Resolves to a straight-line fallback estimate instead of rejecting, so
 * callers never need their own try/catch — an OSRM outage just degrades quietly.
 */
export async function fetchRoute(
  waypoints: LatLng[],
  mode: TransportMode,
  signal?: AbortSignal
): Promise<RouteResult> {
  const endpoint = OSRM_BASE[mode];
  if (!endpoint || waypoints.length < 2) return fallbackRoute(waypoints, mode);

  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${endpoint.serviceUrl}/route/v1/${endpoint.profile}/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return fallbackRoute(waypoints, mode);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return fallbackRoute(waypoints, mode);
    const geometry: LatLng[] = (route.geometry?.coordinates ?? []).map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );
    return {
      distanceM: route.distance,
      durationMin: route.duration / 60,
      geometry: geometry.length > 0 ? geometry : waypoints,
    };
  } catch {
    return fallbackRoute(waypoints, mode);
  }
}
