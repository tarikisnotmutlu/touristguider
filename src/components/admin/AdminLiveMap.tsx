"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import type { PlayerTelemetry } from "@/lib/telemetry";

// Same worker-URL fix as the main MapView — see that file for the full
// explanation of why this is necessary under Turbopack.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

const FALLBACK_CENTER: [number, number] = [28.9784, 41.0082];

/** Minimal standalone map for the Game Master dashboard — just plots a
 *  colored dot + label per player at their last-reported lat/lng. Kept
 *  intentionally separate from the trip-editing MapView (no routes,
 *  markers, drag-to-edit, etc.) since the admin view has none of that. */
export default function AdminLiveMap({ players }: { players: PlayerTelemetry[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const isMapInitialized = useRef(false);

  useEffect(() => {
    if (!container.current || mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    const map = new maplibregl.Map({
      container: container.current,
      style: CARTO_POSITRON_STYLE,
      center: FALLBACK_CENTER,
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => setTimeout(() => map.resize(), 0));

    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      isMapInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    const located = players.filter((p) => p.lat != null && p.lng != null);
    markersRef.current = located.map((p) => {
      const el = document.createElement("div");
      el.className = "flex flex-col items-center gap-1";
      el.innerHTML = `
        <div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>
        <div style="font-size:11px;font-weight:600;color:#292524;background:rgba(255,255,255,0.9);padding:1px 6px;border-radius:9999px;white-space:nowrap">${p.playerName}</div>
      `;
      return new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng as number, p.lat as number])
        .addTo(map);
    });

    if (located.length > 0) {
      const bounds = located.reduce(
        (b, p) => b.extend([p.lng as number, p.lat as number]),
        new maplibregl.LngLatBounds([located[0].lng as number, located[0].lat as number], [
          located[0].lng as number,
          located[0].lat as number,
        ])
      );
      try {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 400 });
      } catch {
        // best-effort recentre only
      }
    }
  }, [players]);

  return <div ref={container} className="h-full w-full" />;
}
