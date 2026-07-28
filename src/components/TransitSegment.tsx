"use client";

import { useEffect, useRef } from "react";
import { Polyline } from "react-leaflet";
import type { LatLng, TransportMode } from "@/lib/types";
import { estimateDurationMin, haversineMeters } from "@/lib/geo";
import { TRANSPORT_COLOR } from "@/lib/transport";

interface TransitSegmentProps {
  mode: TransportMode;
  from: LatLng;
  to: LatLng;
  onRouteFound: (info: { distanceM: number; durationMin: number; geometry: LatLng[] }) => void;
}

/**
 * Metro/bus/ferry legs have no free routable network (OSRM only knows roads and
 * paths), so instead of pretending to route them we draw a clearly "schematic"
 * dashed straight line and estimate time from distance. There is nothing to
 * manually drag here — that's intentional, it wouldn't mean anything for a subway line.
 */
export default function TransitSegment({ mode, from, to, onRouteFound }: TransitSegmentProps) {
  const onRouteFoundRef = useRef(onRouteFound);
  useEffect(() => {
    onRouteFoundRef.current = onRouteFound;
  }, [onRouteFound]);

  useEffect(() => {
    const distanceM = haversineMeters(from, to);
    onRouteFoundRef.current({
      distanceM,
      durationMin: estimateDurationMin(distanceM, mode),
      geometry: [from, to],
    });
    // Deliberately keyed on the primitive coordinates, not `from`/`to` themselves —
    // the caller passes fresh object literals every render, which would refire this
    // on every unrelated store update instead of only on an actual position change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, from.lat, from.lng, to.lat, to.lng]);

  return (
    <Polyline
      positions={[
        [from.lat, from.lng],
        [to.lat, to.lng],
      ]}
      pathOptions={{ color: TRANSPORT_COLOR[mode], weight: 4, opacity: 0.75, dashArray: "2 10" }}
    />
  );
}
