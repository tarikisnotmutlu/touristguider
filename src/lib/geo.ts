import type { LatLng, TransportMode } from "./types";

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Rough average speeds (km/h) used only as an instant placeholder before OSRM responds. */
const AVERAGE_SPEED_KMH: Record<TransportMode, number> = {
  walk: 4.5,
  drive: 28,
  transit: 26,
  ferry: 18,
};

export function estimateDurationMin(distanceM: number, mode: TransportMode): number {
  const speedKmh = AVERAGE_SPEED_KMH[mode];
  const hours = distanceM / 1000 / speedKmh;
  return Math.max(1, Math.round(hours * 60));
}

/** Compass bearing (degrees, 0 = north, clockwise) from `a` to `b` — used to
 *  orient the small arrow marker that points along the active step's route. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Projects `point` onto the piecewise-linear `line`, treating lat/lng as locally
 * flat (fine at city scale). Returns how far along the line (0..1) the closest
 * point falls, and the perpendicular distance to it — used to (a) decide whether
 * a drag started close enough to a route to count as "grabbing" it, and (b) pick
 * where a newly-dropped via point belongs among the other via points in order.
 */
export function projectPointOntoPolyline(
  line: LatLng[],
  point: LatLng
): { fraction: number; distanceM: number } {
  if (line.length < 2) return { fraction: 0, distanceM: Infinity };

  // Local equirectangular projection around the line's first point keeps this a
  // plain 2D segment-projection problem instead of doing this in lat/lng directly.
  const originLat = line[0].lat;
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const toXY = (p: LatLng) => ({
    x: (p.lng - line[0].lng) * cosLat,
    y: p.lat - line[0].lat,
  });

  const pts = line.map(toXY);
  const target = toXY(point);

  let cumulative = 0;
  const cumAtVertex: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    cumAtVertex.push(cumulative);
  }
  const total = cumulative || 1;

  let bestDistSq = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const segLenSq = abx * abx + aby * aby || 1e-12;
    let t = ((target.x - a.x) * abx + (target.y - a.y) * aby) / segLenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * abx;
    const projY = a.y + t * aby;
    const distSq = (target.x - projX) ** 2 + (target.y - projY) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const segLen = Math.sqrt(segLenSq);
      bestAlong = cumAtVertex[i] + t * segLen;
    }
  }

  // Convert the local-degree distance back to meters via a rough haversine scale
  // (good enough for the few-meter tolerances this is used for).
  const distanceM = Math.sqrt(bestDistSq) * 111320;
  return { fraction: bestAlong / total, distanceM };
}

export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
