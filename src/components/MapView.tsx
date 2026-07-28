"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Marker,
  Source,
  Layer,
  NavigationControl,
  AttributionControl,
  type MapRef,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { ROUTABLE_MODES, type LatLng } from "@/lib/types";
import { pointBefore } from "@/lib/dayHelpers";
import { fetchRoute } from "@/lib/osrmHttp";
import { boundsOf, estimateDurationMin, haversineMeters, projectPointOntoPolyline } from "@/lib/geo";
import { dayColor } from "@/lib/dayColors";
import {
  StartMarker,
  StepMarker,
  ViaMarker,
  GhostMarker,
  GemMarker,
  LiveLocationMarker,
} from "./MapMarkers";
import HiddenGemCreateForm from "./HiddenGemCreateForm";

function lineSourceId(dayId: string, segIndex: number) {
  return `route-${dayId}-${segIndex}`;
}

function toGeoJSONLine(coords: LatLng[], properties: Record<string, string | number>) {
  return {
    type: "Feature" as const,
    properties,
    geometry: {
      type: "LineString" as const,
      coordinates: coords.map((p) => [p.lng, p.lat]),
    },
  };
}

interface DragState {
  dayId: string;
  segIndex: number;
}

export default function MapView() {
  const mapRef = useRef<MapRef>(null);
  const [ready, setReady] = useState(false);
  const [placingGem, setPlacingGem] = useState(false);
  const [pendingGemPoint, setPendingGemPoint] = useState<LatLng | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghostPoint, setGhostPoint] = useState<LatLng | null>(null);

  const fetchKeyRef = useRef(new Map<string, string>());
  const abortRef = useRef(new Map<string, AbortController>());
  const fitDayIdRef = useRef<string | null>(null);

  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const setActiveStepId = useTripStore((s) => s.setActiveStepId);
  const setActiveGemId = useTripStore((s) => s.setActiveGemId);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const liveLocation = useJourneyStore((s) => s.liveLocation);
  const day = trip.days[activeDayIndex];

  // ---- gently pan the camera to follow the live location while tracking ----
  useEffect(() => {
    if (!ready || !liveLocation || !mapRef.current) return;
    try {
      mapRef.current.easeTo({ center: [liveLocation.lng, liveLocation.lat], duration: 1200 });
    } catch {
      // ignore — same defensive rationale as the fitBounds call below
    }
  }, [ready, liveLocation]);

  const hitLayerIds = useMemo(() => {
    if (!day) return [];
    return day.steps
      .map((_, i) => ({ i, mode: day.routes[i]?.mode }))
      .filter(({ mode }) => mode && ROUTABLE_MODES.includes(mode))
      .map(({ i }) => `${lineSourceId(day.id, i)}-hit`);
  }, [day]);

  // ---- fetch/refresh route geometry for each segment as needed ----
  useEffect(() => {
    if (!day) return;
    day.steps.forEach((step, i) => {
      const route = day.routes[i];
      const from = pointBefore(day, i);
      const to: LatLng = { lat: step.lat, lng: step.lng };
      const segId = `${day.id}:${i}`;

      if (!ROUTABLE_MODES.includes(route.mode)) {
        const key = `transit:${from.lat},${from.lng}:${to.lat},${to.lng}`;
        if (fetchKeyRef.current.get(segId) !== key) {
          fetchKeyRef.current.set(segId, key);
          const distanceM = haversineMeters(from, to);
          useTripStore.getState().setRouteFound(day.id, i, {
            distanceM,
            durationMin: estimateDurationMin(distanceM, route.mode),
            geometry: [from, to],
          });
        }
        return;
      }

      const key = JSON.stringify({
        mode: route.mode,
        from,
        to,
        via: route.manualWaypoints,
        nonce: route.resetNonce,
      });
      if (fetchKeyRef.current.get(segId) === key) return;
      fetchKeyRef.current.set(segId, key);

      abortRef.current.get(segId)?.abort();
      const controller = new AbortController();
      abortRef.current.set(segId, controller);

      const waypoints = [from, ...route.manualWaypoints, to];
      fetchRoute(waypoints, route.mode, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        useTripStore.getState().setRouteFound(day.id, i, result);
      });
    });
  }, [day]);

  // ---- fit bounds once per day switch ----
  useEffect(() => {
    if (!ready || !day || !mapRef.current) return;
    if (fitDayIdRef.current === day.id) return;
    fitDayIdRef.current = day.id;
    const points = [day.startPoint, ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng }))];
    const bounds = boundsOf(points);
    if (!bounds) return;
    try {
      // maplibre-gl's internal camera transform can occasionally not be ready
      // yet right after a resize/style reload; fitBounds is a nice-to-have
      // (auto-centering), so a failure here should never crash the map.
      mapRef.current.fitBounds(
        [
          [bounds[0][1], bounds[0][0]],
          [bounds[1][1], bounds[1][0]],
        ],
        { padding: 70, maxZoom: 16, duration: 400 }
      );
    } catch {
      // ignore — the map just won't auto-recenter this once
    }
  }, [ready, day]);

  function beginDrag(e: MapLayerMouseEvent | MapLayerTouchEvent) {
    const hit = e.features?.[0];
    if (!hit) return;
    e.preventDefault();
    mapRef.current?.getMap().dragPan.disable();
    setDragState({
      dayId: String(hit.properties?.dayId),
      segIndex: Number(hit.properties?.segIndex),
    });
    setGhostPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  }

  function onMove(e: MapLayerMouseEvent | MapLayerTouchEvent) {
    if (!dragState) return;
    setGhostPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  }

  function endDrag() {
    if (!dragState || !ghostPoint) {
      setDragState(null);
      setGhostPoint(null);
      return;
    }
    mapRef.current?.getMap().dragPan.enable();

    const state = useTripStore.getState();
    const targetDay = state.trip.days.find((d) => d.id === dragState.dayId);
    const route = targetDay?.routes[dragState.segIndex];
    if (targetDay && route) {
      const from = pointBefore(targetDay, dragState.segIndex);
      const to = targetDay.steps[dragState.segIndex];
      const geometry = route.geometry.length >= 2 ? route.geometry : [from, to];
      const newFraction = projectPointOntoPolyline(geometry, ghostPoint).fraction;

      let insertAt = route.manualWaypoints.length;
      for (let i = 0; i < route.manualWaypoints.length; i++) {
        const f = projectPointOntoPolyline(geometry, route.manualWaypoints[i]).fraction;
        if (newFraction < f) {
          insertAt = i;
          break;
        }
      }
      state.insertManualWaypoint(dragState.dayId, dragState.segIndex, insertAt, ghostPoint);
    }
    setDragState(null);
    setGhostPoint(null);
  }

  function handleMapClick(e: MapLayerMouseEvent) {
    if (!placingGem) return;
    setPendingGemPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    setPlacingGem(false);
  }

  if (!day) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400">
        No day selected
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapStyle={CARTO_POSITRON_STYLE}
        initialViewState={{ longitude: day.startPoint.lng, latitude: day.startPoint.lat, zoom: 13 }}
        attributionControl={false}
        interactiveLayerIds={hitLayerIds}
        cursor={placingGem ? "crosshair" : dragState ? "grabbing" : undefined}
        onLoad={() => setReady(true)}
        onClick={handleMapClick}
        onMouseDown={beginDrag}
        onTouchStart={beginDrag}
        onMouseMove={onMove}
        onTouchMove={onMove}
        onMouseUp={endDrag}
        onTouchEnd={endDrag}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <AttributionControl position="bottom-right" compact />

        <Marker longitude={day.startPoint.lng} latitude={day.startPoint.lat} anchor="center">
          <StartMarker />
        </Marker>

        {day.steps.map((step, i) => {
          const route = day.routes[i];
          const from = pointBefore(day, i);
          const to: LatLng = { lat: step.lat, lng: step.lng };
          const srcId = lineSourceId(day.id, i);
          const coords = route.geometry.length >= 2 ? route.geometry : [from, to];
          const geojson = toGeoJSONLine(coords, { dayId: day.id, segIndex: i });
          const color = dayColor(activeDayIndex);
          const routable = ROUTABLE_MODES.includes(route.mode);

          return (
            <Source key={srcId} id={srcId} type="geojson" data={geojson}>
              <Layer
                id={`${srcId}-line`}
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": color,
                  "line-width": 5,
                  "line-opacity": 0.85,
                  ...(routable ? {} : { "line-dasharray": [1, 2] }),
                }}
              />
              {routable && (
                <Layer
                  id={`${srcId}-hit`}
                  type="line"
                  layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{ "line-color": "#000", "line-width": 24, "line-opacity": 0 }}
                />
              )}
            </Source>
          );
        })}

        {day.steps.map((step, i) => {
          const route = day.routes[i];
          return route.manualWaypoints.map((wp, viaIndex) => (
            <Marker
              key={`${step.id}-via-${viaIndex}`}
              longitude={wp.lng}
              latitude={wp.lat}
              anchor="center"
              draggable
              onDragEnd={(e) =>
                useTripStore
                  .getState()
                  .updateManualWaypoint(day.id, i, viaIndex, { lat: e.lngLat.lat, lng: e.lngLat.lng })
              }
            >
              <div
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  useTripStore.getState().removeManualWaypoint(day.id, i, viaIndex);
                }}
              >
                <ViaMarker />
              </div>
            </Marker>
          ));
        })}

        {ghostPoint && (
          <Marker longitude={ghostPoint.lng} latitude={ghostPoint.lat} anchor="center">
            <GhostMarker />
          </Marker>
        )}

        {day.steps.map((step, i) => (
          <Marker
            key={step.id}
            longitude={step.lng}
            latitude={step.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setActiveStepId(step.id);
            }}
          >
            <StepMarker index={i + 1} category={step.category} active={step.id === activeStepId} />
          </Marker>
        ))}

        {trip.hiddenGems.map((gem) => (
          <Marker
            key={gem.id}
            longitude={gem.lng}
            latitude={gem.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setActiveGemId(gem.id);
            }}
          >
            <GemMarker />
          </Marker>
        ))}

        {liveLocation && (
          <Marker longitude={liveLocation.lng} latitude={liveLocation.lat} anchor="center">
            <LiveLocationMarker />
          </Marker>
        )}
      </MapGL>

      {/* Desktop-only, edit-mode-only "creator mode" control for dropping a
          Hidden Gem pin. Positioned top-right (below the zoom control) rather
          than top-left, since the 400px glass sidebar covers that corner. */}
      {isEditMode && (
        <button
          onClick={() => setPlacingGem((v) => !v)}
          type="button"
          className={
            "glass-panel absolute right-4 top-20 hidden items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg lg:flex " +
            (placingGem
              ? "ring-2 ring-terracotta-400 text-terracotta-700"
              : "text-stone-600 hover:text-stone-900")
          }
        >
          💎 {placingGem ? "Click the map to drop it…" : "Drop Hidden Gem"}
        </button>
      )}

      {pendingGemPoint && (
        <HiddenGemCreateForm
          point={pendingGemPoint}
          onCancel={() => setPendingGemPoint(null)}
          onSave={(note) => {
            useTripStore.getState().addHiddenGem(pendingGemPoint, note);
            setPendingGemPoint(null);
          }}
        />
      )}

      {/* Tile load can take a beat on a cold connection — without this, that
          window reads as "the map is broken" instead of "it's loading". */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-stone-100">
          <div className="flex flex-col items-center gap-2 text-stone-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-500" />
            <p className="text-xs font-medium">Loading map…</p>
          </div>
        </div>
      )}
    </div>
  );
}
