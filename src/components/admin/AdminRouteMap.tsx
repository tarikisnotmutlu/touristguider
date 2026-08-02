"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { fetchTrip, saveTrip } from "@/lib/tripApi";
import { dayColor } from "@/lib/dayColors";
import { pointBefore } from "@/lib/dayHelpers";
import type { LatLng, Trip } from "@/lib/types";
import { createStepMarkerEl, createStartMarkerEl } from "../MapMarkers";

// Same worker-URL fix as the other admin/player maps — see MapView.tsx for
// the full explanation of why this is necessary under Turbopack.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

const FALLBACK_CENTER: [number, number] = [28.9784, 41.0082];

function lineSourceId(dayId: string, segIndex: number) {
  return `admin-route-${dayId}-${segIndex}`;
}

function toGeoJSONLine(coords: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords.map((p) => [p.lng, p.lat]) },
  };
}

/** Read-only trip/route viewer for the Game Master: load a trip, page
 *  through its days, and see exactly what each traveler's map looks like —
 *  same route geometry and day colors as the player app, just without any
 *  of the editing affordances. Also owns "Reset Day", which un-checks every
 *  step for the selected day directly in the shared trip document. */
export default function AdminRouteMap({ tripId }: { tripId?: string } = {}) {
  const [tripIdInput, setTripIdInput] = useState(tripId ?? "");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [showRoutes, setShowRoutes] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapInitialized = useRef(false);
  const stepMarkersRef = useRef<maplibregl.Marker[]>([]);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeIdsRef = useRef<string[]>([]);
  const fitOnceRef = useRef<string | null>(null);

  // ---- map init (once) ----
  useEffect(() => {
    if (!container.current || mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    const map = new maplibregl.Map({
      container: container.current,
      style: CARTO_POSITRON_STYLE,
      center: FALLBACK_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => setTimeout(() => map.resize(), 0));

    return () => {
      stepMarkersRef.current.forEach((m) => m.remove());
      startMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      isMapInitialized.current = false;
    };
  }, []);

  const loadTrip = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setResetMessage(null);
    try {
      const found = await fetchTrip(id);
      if (!found) {
        setLoadError("No trip found with that id.");
        setTrip(null);
        return;
      }
      setTrip(found);
      setDayIndex(0);
      fitOnceRef.current = null;
    } catch {
      setLoadError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Arriving here via /admin/[tripId] already knows which trip to show —
  // load it immediately instead of making the GM type the id in by hand.
  useEffect(() => {
    if (!tripId) return;
    const timer = setTimeout(() => loadTrip(tripId), 0);
    return () => clearTimeout(timer);
  }, [tripId, loadTrip]);

  function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    loadTrip(tripIdInput.trim());
  }

  const day = trip?.days[dayIndex] ?? null;

  // ---- sync route lines + step/start markers for the selected day ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !day) return;

    function applyDay() {
      if (!map || !day) return;

      routeIdsRef.current.forEach((id) => {
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
        if (map.getSource(id)) map.removeSource(id);
      });
      routeIdsRef.current = [];

      const color = dayColor(dayIndex);
      day.steps.forEach((step, i) => {
        const route = day.routes[i];
        const from = pointBefore(day, i);
        const to: LatLng = { lat: step.lat, lng: step.lng };
        const coords = route.geometry.length >= 2 ? route.geometry : [from, to];
        const srcId = lineSourceId(day.id, i);

        map.addSource(srcId, { type: "geojson", data: toGeoJSONLine(coords) });
        map.addLayer({
          id: `${srcId}-line`,
          type: "line",
          source: srcId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: showRoutes ? "visible" : "none",
          },
          paint: {
            "line-color": color,
            "line-width": 5,
            "line-opacity": 0.85,
            ...(route.mode === "walk" ? { "line-dasharray": [0.3, 1.8] } : {}),
          },
        });
        routeIdsRef.current.push(srcId);
      });

      stepMarkersRef.current.forEach((m) => m.remove());
      stepMarkersRef.current = day.steps.map((step, i) => {
        const el = createStepMarkerEl(i + 1, step.category, false, color);
        return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([step.lng, step.lat]).addTo(map);
      });

      startMarkerRef.current?.remove();
      startMarkerRef.current = new maplibregl.Marker({
        element: createStartMarkerEl(color),
        anchor: "center",
      })
        .setLngLat([day.startPoint.lng, day.startPoint.lat])
        .addTo(map);

      if (fitOnceRef.current !== day.id) {
        fitOnceRef.current = day.id;
        const points = [day.startPoint, ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng }))];
        const bounds = points.reduce(
          (b, p) => b.extend([p.lng, p.lat]),
          new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
        );
        try {
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
        } catch {
          // best-effort only
        }
      }
    }

    if (map.isStyleLoaded()) applyDay();
    else map.once("styledata", applyDay);
  }, [day, dayIndex, showRoutes]);

  // ---- toggle route line visibility without rebuilding sources/markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeIdsRef.current.forEach((id) => {
      if (map.getLayer(`${id}-line`)) {
        map.setLayoutProperty(`${id}-line`, "visibility", showRoutes ? "visible" : "none");
      }
    });
  }, [showRoutes]);

  async function handleResetDay() {
    if (!trip || !day) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const nextTrip: Trip = {
        ...trip,
        days: trip.days.map((d, i) =>
          i === dayIndex ? { ...d, steps: d.steps.map((s) => ({ ...s, completed: false })) } : d
        ),
      };
      setTrip(nextTrip);
      await saveTrip(nextTrip);
      setResetMessage(`${day.label || `Day ${dayIndex + 1}`} reset — every stop is unchecked again.`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />

      <form
        onSubmit={handleLoad}
        className="glass-panel absolute left-4 top-4 z-10 flex w-72 flex-col gap-2 rounded-2xl p-3 shadow-lg"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Trip to view</p>
        <div className="flex gap-1.5">
          <input
            value={tripIdInput}
            onChange={(e) => setTripIdInput(e.target.value)}
            placeholder="Trip id"
            className="w-full rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !tripIdInput.trim()}
            className="shrink-0 rounded-full bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {loading ? "…" : "Load"}
          </button>
        </div>
        {loadError && <p className="text-[11px] text-terracotta-600">{loadError}</p>}

        {trip && (
          <>
            <p className="text-[11px] text-stone-400">{trip.title}</p>
            <div className="flex flex-wrap gap-1">
              {trip.days.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDayIndex(i);
                    setResetMessage(null);
                  }}
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                    (i === dayIndex ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")
                  }
                >
                  {d.label || `Day ${i + 1}`}
                </button>
              ))}
            </div>

            <label className="mt-1 flex items-center gap-2 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={showRoutes}
                onChange={(e) => setShowRoutes(e.target.checked)}
                className="accent-sage-600"
              />
              Show routes
            </label>

            <button
              onClick={handleResetDay}
              disabled={resetting || !day || day.steps.length === 0}
              type="button"
              title="Uncheck every stop for this day"
              className="mt-1 rounded-full bg-terracotta-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-terracotta-700 disabled:opacity-40"
            >
              {resetting ? "Resetting…" : `🔄 Reset ${day?.label || `Day ${dayIndex + 1}`}`}
            </button>
            {resetMessage && <p className="text-[11px] text-sage-700">{resetMessage}</p>}
          </>
        )}
      </form>

      {!trip && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-400">
          Load a trip by id to view its routes.
        </div>
      )}
    </div>
  );
}
