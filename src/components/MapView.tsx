"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTripStore } from "@/store/useTripStore";
import { CARTO_VOYAGER_STYLE } from "@/lib/maplibreStyle";
import { ROUTABLE_MODES, type LatLng } from "@/lib/types";
import { pointBefore } from "@/lib/dayHelpers";
import { fetchRoute } from "@/lib/osrmHttp";
import { boundsOf, estimateDurationMin, haversineMeters, projectPointOntoPolyline } from "@/lib/geo";
import { TRANSPORT_COLOR } from "@/lib/transport";
import { CATEGORY_COLOR, CATEGORY_ICON } from "@/lib/categories";
import {
  createGhostMarkerEl,
  createStartMarkerEl,
  createStepMarkerEl,
  createViaMarkerEl,
} from "@/lib/domMarkers";

function lineSourceId(dayId: string, segIndex: number) {
  return `route-${dayId}-${segIndex}`;
}
function hitLayerId(dayId: string, segIndex: number) {
  return `${lineSourceId(dayId, segIndex)}-hit`;
}
function lineLayerId(dayId: string, segIndex: number) {
  return `${lineSourceId(dayId, segIndex)}-line`;
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
  ghost: Marker;
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  const stepMarkersRef = useRef(new Map<string, Marker>());
  const startMarkerRef = useRef<Marker | null>(null);
  const viaMarkersRef = useRef(new Map<string, Marker>());
  const sourceIdsRef = useRef(new Set<string>());
  const hitLayerIdsRef = useRef(new Set<string>());
  const fetchKeyRef = useRef(new Map<string, string>());
  const abortRef = useRef(new Map<string, AbortController>());
  const currentDayIdRef = useRef<string | null>(null);
  const fitDayIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const day = trip.days[activeDayIndex];

  // ---- create the map once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: CARTO_VOYAGER_STYLE,
      center: [28.98, 41.01],
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }));
    mapRef.current = map;
    // "style.load" (style parsed, sources/layers can be added) rather than "load"
    // (which also waits for the first tile render) — markers and our route
    // sources don't need tiles to be visible yet, so this gets content on screen
    // sooner.
    map.on("style.load", () => setReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- drag-to-edit-route: mousedown/touchstart on a route's hit layer starts it ----
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    function beginDrag(e: MapMouseEvent | MapTouchEvent) {
      const layers = Array.from(hitLayerIdsRef.current);
      if (layers.length === 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers });
      const hit = features[0];
      if (!hit) return;

      e.preventDefault();
      map.dragPan.disable();
      const ghost = new Marker({ element: createGhostMarkerEl() })
        .setLngLat(e.lngLat)
        .addTo(map);
      dragStateRef.current = {
        dayId: String(hit.properties?.dayId),
        segIndex: Number(hit.properties?.segIndex),
        ghost,
      };
      map.getCanvas().style.cursor = "grabbing";
    }

    function onMove(e: MapMouseEvent | MapTouchEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      drag.ghost.setLngLat(e.lngLat);
    }

    function endDrag() {
      const drag = dragStateRef.current;
      if (!drag) return;
      dragStateRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";

      const point = drag.ghost.getLngLat();
      drag.ghost.remove();

      const state = useTripStore.getState();
      const targetDay = state.trip.days.find((d) => d.id === drag.dayId);
      const route = targetDay?.routes[drag.segIndex];
      if (!targetDay || !route) return;

      const from = pointBefore(targetDay, drag.segIndex);
      const to = targetDay.steps[drag.segIndex];
      const geometry = route.geometry.length >= 2 ? route.geometry : [from, to];
      const newPoint: LatLng = { lat: point.lat, lng: point.lng };
      const newFraction = projectPointOntoPolyline(geometry, newPoint).fraction;

      let insertAt = route.manualWaypoints.length;
      for (let i = 0; i < route.manualWaypoints.length; i++) {
        const f = projectPointOntoPolyline(geometry, route.manualWaypoints[i]).fraction;
        if (newFraction < f) {
          insertAt = i;
          break;
        }
      }
      state.insertManualWaypoint(drag.dayId, drag.segIndex, insertAt, newPoint);
    }

    map.on("mousedown", beginDrag);
    map.on("touchstart", beginDrag);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove);
    map.on("mouseup", endDrag);
    map.on("touchend", endDrag);
    // Catch releases that happen outside the canvas.
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);

    return () => {
      map.off("mousedown", beginDrag);
      map.off("touchstart", beginDrag);
      map.off("mousemove", onMove);
      map.off("touchmove", onMove);
      map.off("mouseup", endDrag);
      map.off("touchend", endDrag);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchend", endDrag);
    };
  }, [ready]);

  function teardownDay(map: MapLibreMap) {
    for (const marker of stepMarkersRef.current.values()) marker.remove();
    stepMarkersRef.current.clear();
    for (const marker of viaMarkersRef.current.values()) marker.remove();
    viaMarkersRef.current.clear();
    for (const srcId of sourceIdsRef.current) {
      const lineId = srcId + "-line";
      const hitId = srcId + "-hit";
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(hitId)) map.removeLayer(hitId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }
    sourceIdsRef.current.clear();
    hitLayerIdsRef.current.clear();
  }

  // ---- sync markers, route layers, and via-point handles whenever the day changes ----
  useEffect(() => {
    if (!ready || !mapRef.current || !day) return;
    const map = mapRef.current;
    const setActiveStepId = useTripStore.getState().setActiveStepId;

    const isNewDay = currentDayIdRef.current !== day.id;
    if (isNewDay) {
      teardownDay(map);
      currentDayIdRef.current = day.id;
    }

    // -- start marker --
    if (!startMarkerRef.current) {
      startMarkerRef.current = new Marker({ element: createStartMarkerEl() })
        .setLngLat([day.startPoint.lng, day.startPoint.lat])
        .addTo(map);
    } else {
      startMarkerRef.current.setLngLat([day.startPoint.lng, day.startPoint.lat]);
    }

    // -- step markers --
    const liveStepIds = new Set(day.steps.map((s) => s.id));
    for (const [id, marker] of stepMarkersRef.current) {
      if (!liveStepIds.has(id)) {
        marker.remove();
        stepMarkersRef.current.delete(id);
      }
    }
    day.steps.forEach((step, i) => {
      const isActive = step.id === activeStepId;
      let marker = stepMarkersRef.current.get(step.id);
      if (!marker) {
        const el = createStepMarkerEl(i + 1, step.category, isActive);
        el.addEventListener("click", () => setActiveStepId(step.id));
        marker = new Marker({ element: el }).setLngLat([step.lng, step.lat]).addTo(map);
        stepMarkersRef.current.set(step.id, marker);
      } else {
        marker.setLngLat([step.lng, step.lat]);
        const el = marker.getElement();
        el.className = "tg-marker" + (isActive ? " tg-marker-active" : "");
        el.style.background = CATEGORY_COLOR[step.category];
        const icon = el.querySelector(".tg-marker-icon");
        if (icon) icon.textContent = CATEGORY_ICON[step.category];
        const badge = el.querySelector(".tg-marker-badge");
        if (badge) badge.textContent = String(i + 1);
      }
    });

    // -- route sources/layers + via-point markers --
    const liveSourceIds = new Set<string>();
    const liveViaKeys = new Set<string>();

    day.steps.forEach((step, i) => {
      const route = day.routes[i];
      const from = pointBefore(day, i);
      const to: LatLng = { lat: step.lat, lng: step.lng };
      const srcId = lineSourceId(day.id, i);
      const lineId = lineLayerId(day.id, i);
      const hitId = hitLayerId(day.id, i);
      liveSourceIds.add(srcId);

      const coords = route.geometry.length >= 2 ? route.geometry : [from, to];
      const geojson = toGeoJSONLine(coords, { dayId: day.id, segIndex: i });
      const color = TRANSPORT_COLOR[route.mode];
      const routable = ROUTABLE_MODES.includes(route.mode);

      if (!sourceIdsRef.current.has(srcId)) {
        map.addSource(srcId, { type: "geojson", data: geojson });
        map.addLayer({
          id: lineId,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": color,
            "line-width": 5,
            "line-opacity": 0.85,
            ...(routable ? {} : { "line-dasharray": [1, 2] }),
          },
        });
        if (routable) {
          map.addLayer({
            id: hitId,
            type: "line",
            source: srcId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#000", "line-width": 24, "line-opacity": 0 },
          });
          hitLayerIdsRef.current.add(hitId);
        }
        sourceIdsRef.current.add(srcId);
      } else {
        (map.getSource(srcId) as GeoJSONSource).setData(geojson);
        map.setPaintProperty(lineId, "line-color", color);
      }

      // Set/refresh which (dayId, segIndex) this hit layer maps to (feature-state
      // isn't queryable via queryRenderedFeatures reliably across styles, so we
      // stash it as a *source* property read back via layer id parsing instead).
      if (routable) {
        map.setLayoutProperty(hitId, "visibility", "visible");
      }

      // -- via-point markers for this segment --
      route.manualWaypoints.forEach((wp, viaIndex) => {
        const key = `${i}:${viaIndex}`;
        liveViaKeys.add(key);
        let marker = viaMarkersRef.current.get(key);
        if (!marker) {
          const el = createViaMarkerEl();
          marker = new Marker({ element: el, draggable: true })
            .setLngLat([wp.lng, wp.lat])
            .addTo(map);
          marker.on("dragend", () => {
            const pos = marker!.getLngLat();
            useTripStore
              .getState()
              .updateManualWaypoint(day.id, i, viaIndex, { lat: pos.lat, lng: pos.lng });
          });
          el.addEventListener("dblclick", (ev) => {
            ev.stopPropagation();
            useTripStore.getState().removeManualWaypoint(day.id, i, viaIndex);
          });
          viaMarkersRef.current.set(key, marker);
        } else {
          marker.setLngLat([wp.lng, wp.lat]);
        }
      });
    });

    // remove sources/layers for segments that no longer exist
    for (const srcId of sourceIdsRef.current) {
      if (!liveSourceIds.has(srcId)) {
        const lineId = srcId + "-line";
        const hitId = srcId + "-hit";
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        if (map.getLayer(hitId)) map.removeLayer(hitId);
        hitLayerIdsRef.current.delete(hitId);
        if (map.getSource(srcId)) map.removeSource(srcId);
        sourceIdsRef.current.delete(srcId);
      }
    }
    for (const [key, marker] of viaMarkersRef.current) {
      if (!liveViaKeys.has(key)) {
        marker.remove();
        viaMarkersRef.current.delete(key);
      }
    }

    // fit bounds once per day switch
    if (fitDayIdRef.current !== day.id) {
      fitDayIdRef.current = day.id;
      const points = [day.startPoint, ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng }))];
      const bounds = boundsOf(points);
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0][1], bounds[0][0]],
            [bounds[1][1], bounds[1][0]],
          ],
          { padding: 70, maxZoom: 16, duration: 400 }
        );
      }
    }
  }, [ready, day, activeStepId]);

  // ---- fetch/refresh route geometry for each segment as needed ----
  useEffect(() => {
    if (!day) return;

    day.steps.forEach((step, i) => {
      const route = day.routes[i];
      const from = pointBefore(day, i);
      const to: LatLng = { lat: step.lat, lng: step.lng };
      const segId = `${day.id}:${i}`;

      if (!ROUTABLE_MODES.includes(route.mode)) {
        // Transit legs: just keep distance/duration synced to a straight line, no fetch.
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

  return <div ref={containerRef} className="h-full w-full" />;
}
