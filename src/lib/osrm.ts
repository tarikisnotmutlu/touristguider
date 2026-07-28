import L from "leaflet";
import "leaflet-routing-machine";
import type { TransportMode } from "./types";

/**
 * leaflet-routing-machine's Itinerary._clearLines() unconditionally calls
 * `this._map.removeLayer(...)` when a route response comes back — with no check
 * that the control might have already been removed from the map in the meantime
 * (e.g. React tore it down because the segment's mode changed, or React Strict
 * Mode's dev-only double-effect intentionally mounts/unmounts it once). When that
 * happens `this._map` is null and it throws.
 *
 * `L.Routing.Control extends Itinerary` via Leaflet's classical `L.Class.extend`,
 * which copies the parent's prototype methods onto the child's own prototype
 * *by value* at define-time rather than leaving them to resolve through the
 * prototype chain — so patching `Itinerary.prototype` alone never reaches actual
 * `Control` instances (what `L.Routing.control()` creates). Both are patched here
 * since we don't control that file.
 */
function patchClearLinesNullMapGuard() {
  const targets = [L.Routing.Itinerary.prototype, L.Routing.Control.prototype] as unknown as {
    _clearLines: () => void;
    _clearLinesPatched?: boolean;
    _map?: L.Map;
  }[];
  for (const proto of targets) {
    // Must be an own-property check: Control.prototype's [[Prototype]] is
    // Itinerary.prototype, so a plain truthy read of `_clearLinesPatched` here
    // would find Itinerary's flag through the chain and skip patching Control's
    // own (separately-copied) `_clearLines` entirely.
    if (Object.prototype.hasOwnProperty.call(proto, "_clearLinesPatched")) continue;
    const original = proto._clearLines;
    proto._clearLines = function (this: { _map?: L.Map }) {
      if (!this._map) return;
      original.call(this);
    };
    proto._clearLinesPatched = true;
  }
}
patchClearLinesNullMapGuard();

/**
 * Free, no-signup OSRM instances run by the OpenStreetMap.de community. Unlike the
 * public router.project-osrm.org demo (driving only), these expose foot/bike/car
 * profiles, which is what lets us route walking and cycling legs too.
 *
 * These are best-effort community servers with no uptime SLA. RouteLayer always
 * falls back to a straight-line estimate if a request fails, so an outage degrades
 * gracefully instead of breaking the page.
 */
const OSRM_ENDPOINTS: Partial<Record<TransportMode, { serviceUrl: string; profile: string }>> = {
  walk: { serviceUrl: "https://routing.openstreetmap.de/routed-foot/route/v1", profile: "foot" },
  cycle: { serviceUrl: "https://routing.openstreetmap.de/routed-bike/route/v1", profile: "bike" },
  drive: { serviceUrl: "https://routing.openstreetmap.de/routed-car/route/v1", profile: "car" },
};

export function osrmRouterFor(mode: TransportMode): L.Routing.IRouter | null {
  const endpoint = OSRM_ENDPOINTS[mode];
  if (!endpoint) return null;
  return L.Routing.osrmv1({
    serviceUrl: endpoint.serviceUrl,
    profile: endpoint.profile,
  });
}
