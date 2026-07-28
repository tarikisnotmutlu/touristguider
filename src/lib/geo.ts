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
  cycle: 15,
  drive: 28,
  bus: 20,
  metro: 32,
  ferry: 18,
};

export function estimateDurationMin(distanceM: number, mode: TransportMode): number {
  const speedKmh = AVERAGE_SPEED_KMH[mode];
  const hours = distanceM / 1000 / speedKmh;
  return Math.max(1, Math.round(hours * 60));
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
