"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-routing-machine";
import type { LatLng, TransportMode } from "@/lib/types";
import { osrmRouterFor } from "@/lib/osrm";
import { TRANSPORT_COLOR } from "@/lib/transport";
import { viaDivIcon } from "@/lib/icons";
import { estimateDurationMin, haversineMeters } from "@/lib/geo";

interface RouteLayerProps {
  mode: TransportMode;
  from: LatLng;
  to: LatLng;
  /** Read once per (re)build — see the ref comment below for why this isn't a live dep. */
  initialManualWaypoints: LatLng[];
  /** Bump this to force a full rebuild (used by "reset to auto route"). */
  resetNonce: number;
  onRouteFound: (info: { distanceM: number; durationMin: number; geometry: LatLng[] }) => void;
  onManualEdit: (waypoints: LatLng[]) => void;
}

/**
 * Wraps a single leaflet-routing-machine control for one day-segment (step N -> step N+1).
 * The control's own itinerary panel and default pin markers are fully hidden (see
 * globals.css + createMarker below) — this component only ever renders the routed
 * line plus small drag-handle dots for user-added via points, so it matches the
 * app's own visual language instead of looking like a bolted-on widget.
 *
 * Dragging the line itself (native leaflet-routing-machine behavior, `addWaypoints`)
 * inserts a via point and re-runs OSRM automatically; that's what gives us
 * "grab the route and redraw it" for free from the plugin.
 */
export default function RouteLayer({
  mode,
  from,
  to,
  initialManualWaypoints,
  resetNonce,
  onRouteFound,
  onManualEdit,
}: RouteLayerProps) {
  const map = useMap();

  // Keep the latest callbacks in refs so the control-building effect below doesn't
  // need them as dependencies (their identity changes every render).
  const onRouteFoundRef = useRef(onRouteFound);
  const onManualEditRef = useRef(onManualEdit);
  useEffect(() => {
    onRouteFoundRef.current = onRouteFound;
    onManualEditRef.current = onManualEdit;
  }, [onRouteFound, onManualEdit]);

  // Same idea for the initial via points: once the control exists it is the live
  // source of truth for its own waypoints (persisted back to the store on every
  // drag), so re-reading this on every store update would fight the user mid-drag.
  // We only want its value at the moment a control is (re)built.
  const initialManualRef = useRef(initialManualWaypoints);
  useEffect(() => {
    initialManualRef.current = initialManualWaypoints;
  }, [initialManualWaypoints]);

  useEffect(() => {
    const router = osrmRouterFor(mode);
    if (!router) return;

    const waypoints = [from, ...initialManualRef.current, to].map((p) =>
      L.latLng(p.lat, p.lng)
    );
    const color = TRANSPORT_COLOR[mode];

    // Split from `.addTo(map)` on purpose: createMarker (used below) closes over
    // `control`, and markers are only built once the control is added to the map —
    // by keeping construction and mounting as two statements, `control` is already
    // assigned by the time that happens.
    const control = L.Routing.control({
      waypoints,
      router,
      routeWhileDragging: false,
      addWaypoints: true,
      fitSelectedRoutes: false,
      show: false,
      // Our own 'routingerror' listener below already recovers with a straight-line
      // estimate — the library's default handler just console.errors on top of that,
      // which is redundant noise (and trips Next's dev overlay for something we
      // already handle gracefully).
      defaultErrorHandler: () => {},
      lineOptions: {
        styles: [{ color, weight: 5, opacity: 0.85 }],
        extendToWaypoints: true,
        missingRouteTolerance: 10,
      },
      createMarker: (i: number, wp: L.Routing.Waypoint, n: number) => {
        // Endpoints are the real step coordinates, rendered separately as our own
        // numbered markers — no draggable pin here to avoid a second source of truth.
        if (i === 0 || i === n - 1) return false;
        const marker = L.marker(wp.latLng, { icon: viaDivIcon(), draggable: true });
        marker.on("dblclick", () => control.spliceWaypoints(i, 1));
        return marker;
      },
    } as L.Routing.RoutingControlOptions & L.Routing.PlanOptions);

    control.addTo(map);

    const handleRoutesFound = (e: L.Routing.RoutingResultEvent) => {
      const route = e.routes?.[0];
      if (!route?.summary) return;
      onRouteFoundRef.current({
        distanceM: route.summary.totalDistance,
        durationMin: route.summary.totalTime / 60,
        geometry: (route.coordinates ?? []).map((c) => ({ lat: c.lat, lng: c.lng })),
      });
    };

    const handleWaypointsChanged = (e: L.Routing.RoutingEvent) => {
      const manual = e.waypoints.slice(1, -1).map((w) => ({ lat: w.latLng.lat, lng: w.latLng.lng }));
      onManualEditRef.current(manual);
    };

    const handleRoutingError = () => {
      const distanceM = haversineMeters(from, to);
      onRouteFoundRef.current({
        distanceM,
        durationMin: estimateDurationMin(distanceM, mode),
        geometry: [from, to],
      });
    };

    control.on("routesfound", handleRoutesFound);
    control.on("waypointschanged", handleWaypointsChanged);
    control.on("routingerror", handleRoutingError);

    return () => {
      map.removeControl(control);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode, from.lat, from.lng, to.lat, to.lng, resetNonce]);

  return null;
}
