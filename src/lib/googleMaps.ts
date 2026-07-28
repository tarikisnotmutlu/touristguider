import type { LatLng, TransportMode } from "./types";

const TRAVEL_MODE: Record<TransportMode, string> = {
  walk: "walking",
  drive: "driving",
  transit: "transit",
  // Google Maps has no dedicated ferry mode — transit is the closest fit
  // and does include ferry legs where they exist.
  ferry: "transit",
};

/** Opens turn-by-turn directions in Google Maps for a single commute leg. */
export function directionsUrl(from: LatLng, to: LatLng, mode: TransportMode): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: TRAVEL_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
