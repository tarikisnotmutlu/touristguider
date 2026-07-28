"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLng } from "@/lib/types";
import { boundsOf } from "@/lib/geo";

/** Fits the map to `points` whenever the given `watch` key changes (e.g. active day id). */
export default function FitBounds({ points, watch }: { points: LatLng[]; watch: string }) {
  const map = useMap();
  const lastWatch = useRef<string | null>(null);

  useEffect(() => {
    if (lastWatch.current === watch) return;
    lastWatch.current = watch;
    const bounds = boundsOf(points);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }, [map, points, watch]);

  return null;
}
