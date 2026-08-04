import type { LatLng, TransportMode } from "./types";

const TRAVEL_MODE: Record<TransportMode, string> = {
  walk: "walking",
  drive: "driving",
  transit: "transit",
  // Google Maps has no dedicated ferry mode — transit is the closest fit
  // and does include ferry legs where they exist.
  ferry: "transit",
};

/** Opens turn-by-turn directions in Google Maps for a single commute leg.
 *
 *  Google Maps has no notion of our OSRM/ORS route geometry — left alone it
 *  draws its own line straight from origin to destination, ignoring any
 *  scenic detour the Admin dragged in via manual waypoints. Passing those
 *  same points as the `waypoints` param forces Google's own routing engine
 *  to thread through them, which is the closest a deep link can get to
 *  "follow this exact path." `URLSearchParams` would percent-encode the `|`
 *  separator (`%7C`), which Google's endpoint doesn't accept, so the
 *  waypoints segment is appended to the query string by hand. */
export function directionsUrl(from: LatLng, to: LatLng, mode: TransportMode, waypoints: LatLng[] = []): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: TRAVEL_MODE[mode],
  });
  let url = `https://www.google.com/maps/dir/?${params.toString()}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|")}`;
  }
  return url;
}
