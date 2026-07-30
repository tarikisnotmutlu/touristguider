"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
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
  createStepMarkerEl,
  updateStepMarkerEl,
  createStartMarkerEl,
  updateStartMarkerEl,
  createViaMarkerEl,
  createGhostMarkerEl,
  createGemMarkerEl,
  createLiveLocationMarkerEl,
} from "./MapMarkers";
import HiddenGemCreateForm from "./HiddenGemCreateForm";

// Istanbul, used only as a fallback center before any trip data has loaded.
const FALLBACK_CENTER: [number, number] = [28.9784, 41.0082];

// MapLibre spins up its tile-parsing worker via `new Worker(new URL(...,
// import.meta.url))` inside its own bundled module — Turbopack doesn't
// resolve that import.meta.url to a real http(s) URL, so the default
// worker script ends up empty and the worker silently fails to parse (no
// basemap tiles or route lines ever render, though DOM markers are
// unaffected since they don't touch the worker at all). Pointing it at a
// copy of the same package's worker file served from /public sidesteps
// that resolution entirely. The worker file itself imports a sibling
// maplibre-gl-shared.mjs (relative to its own URL), so that has to be
// copied alongside it. Both must be re-copied from
// node_modules/maplibre-gl/dist/ if maplibre-gl is upgraded:
//   cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/
//   cp node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs public/
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

function lineSourceId(dayId: string, segIndex: number) {
  return `route-${dayId}-${segIndex}`;
}

function toGeoJSONLine(
  coords: LatLng[],
  properties: Record<string, string | number | boolean>
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: coords.map((p) => [p.lng, p.lat]),
    },
  };
}

/** Marker click → expand the bottom sheet and scroll to the matching
 *  Location Card. Deferred so the sheet's own expand animation has time to
 *  grow the scroll container to (close to) its final height first —
 *  scrolling immediately would compute an offset against the still-small
 *  collapsed layout and land in the wrong place. Both DesktopPanel and
 *  MobileSheet render their own copy of the timeline, so this queries all
 *  matches and scrolls whichever one is actually visible/laid out
 *  (`offsetParent !== null`) rather than assuming a single element. */
function scrollToStepCard(stepId: string) {
  setTimeout(() => {
    const candidates = document.querySelectorAll<HTMLElement>(`[data-step-card-id="${CSS.escape(stepId)}"]`);
    for (const el of Array.from(candidates)) {
      if (el.offsetParent !== null) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  }, 350);
}

interface DragState {
  dayId: string;
  segIndex: number;
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Explicit alongside `mapRef.current` (which already guards against a
  // second construction) so the init effect's early-return reads as an
  // intentional StrictMode-double-mount lock, not just a null check.
  const isMapInitialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [placingGem, setPlacingGem] = useState(false);
  const [pendingGemPoint, setPendingGemPoint] = useState<LatLng | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghostPoint, setGhostPoint] = useState<LatLng | null>(null);

  // Mirrors of state read inside stable (bound-once) map event handlers,
  // which otherwise close over stale values.
  const placingGemRef = useRef(placingGem);
  const dragStateRef = useRef(dragState);
  const ghostPointRef = useRef(ghostPoint);
  const hitLayerIdsRef = useRef<string[]>([]);

  const fetchKeyRef = useRef(new Map<string, string>());
  const abortRef = useRef(new Map<string, AbortController>());
  const fitDayIdRef = useRef<string | null>(null);
  const routeSignaturesRef = useRef(new Map<string, string>());

  // Keyed dictionaries (day.id / step.id) rather than plain arrays — lets the
  // marker-sync effects below update an existing marker's position/element
  // in place instead of tearing down and recreating every marker on every
  // trip mutation, which was the source of a visible flicker across all
  // markers whenever a single step was toggled done.
  const startMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const stepMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const viaMarkersRef = useRef<maplibregl.Marker[]>([]);
  const ghostMarkerRef = useRef<maplibregl.Marker | null>(null);
  const gemMarkersRef = useRef<maplibregl.Marker[]>([]);
  const liveMarkerRef = useRef<maplibregl.Marker | null>(null);

  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const liveLocation = useJourneyStore((s) => s.liveLocation);
  const panelView = useJourneyStore((s) => s.panelView);
  const day = trip.days[activeDayIndex];
  const overviewMode = panelView === "overview";
  // In overview mode every day renders at once, each carrying its own real
  // index into trip.days so its route/marker color stays stable regardless
  // of which day is "active" — otherwise leaving overview would repaint
  // every day in the active day's single color.
  const daysToRender = useMemo(
    () => (overviewMode ? trip.days.map((d, i) => ({ day: d, index: i })) : day ? [{ day, index: activeDayIndex }] : []),
    [overviewMode, trip.days, day, activeDayIndex]
  );

  useEffect(() => {
    placingGemRef.current = placingGem;
  }, [placingGem]);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);
  useEffect(() => {
    ghostPointRef.current = ghostPoint;
  }, [ghostPoint]);

  const hitLayerIds = useMemo(() => {
    // Manual-waypoint dragging only makes sense for a single active day's
    // route being edited — disabled in overview mode, where every day's
    // routes render at once and there's no single "current" route to bend.
    if (!day || overviewMode) return [];
    return day.steps
      .map((_, i) => ({ i, mode: day.routes[i]?.mode }))
      .filter(({ mode }) => mode && ROUTABLE_MODES.includes(mode))
      .map(({ i }) => `${lineSourceId(day.id, i)}-hit`);
  }, [day, overviewMode]);
  useEffect(() => {
    hitLayerIdsRef.current = hitLayerIds;
  }, [hitLayerIds]);

  function commitDragEnd(dragState: DragState, ghostPoint: LatLng) {
    const state = useTripStore.getState();
    const targetDay = state.trip.days.find((d) => d.id === dragState.dayId);
    const route = targetDay?.routes[dragState.segIndex];
    if (!targetDay || !route) return;
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

  // ---- initialize the raw maplibre-gl map exactly once ----
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    const state = useTripStore.getState();
    const startDay = state.trip.days[state.activeDayIndex];
    const center: [number, number] = startDay
      ? [startDay.startPoint.lng, startDay.startPoint.lat]
      : FALLBACK_CENTER;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: CARTO_POSITRON_STYLE,
      center,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "MapLibre" }), "bottom-right");

    map.on("load", () => {
      setReady(true);
      // A deferred resize() right after 'load' catches the case where the
      // canvas painted its first frame at a stale size (container still
      // mid-transition/animation) — cheap, and a no-op if the size was
      // already correct.
      setTimeout(() => map.resize(), 0);
    });
    map.on("error", (e: maplibregl.ErrorEvent) => {
      // Surfaces style/tile load failures in the console instead of failing
      // silently — a blank basemap with no error is much harder to diagnose.
      console.error("Map error:", e.error);
    });

    // ---- "wake up" hack ----
    // MapLibre sometimes finishes its initial layout with a stale canvas
    // size (e.g. constructed while a parent was still animating/hidden), and
    // its internal sourceCache tile loading is driven entirely by its own
    // render loop — if that loop never gets nudged, the canvas can sit there
    // forever with no tiles ever requested. `resize()` re-reads the
    // container's real dimensions and `triggerRepaint()` forces a fresh
    // frame; calling both repeatedly across the first couple seconds (and
    // again whenever the tab/container could plausibly have changed size)
    // is a cheap, forceful way to make sure the map never gets stuck blank.
    function wakeUp() {
      map.resize();
      map.triggerRepaint();
    }
    const wakeTimers = [0, 100, 300, 600, 1000, 2000].map((ms) => window.setTimeout(wakeUp, ms));
    window.addEventListener("resize", wakeUp);
    window.addEventListener("orientationchange", wakeUp);
    document.addEventListener("visibilitychange", wakeUp);
    const resizeObserver = new ResizeObserver(wakeUp);
    resizeObserver.observe(mapContainer.current);

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (!placingGemRef.current) return;
      setPendingGemPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setPlacingGem(false);
    });

    function queryHit(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
      try {
        return map.queryRenderedFeatures(e.point, { layers: hitLayerIdsRef.current })[0];
      } catch {
        // A hit layer referenced here may not exist yet right after a route
        // is added — treat that the same as "nothing under the cursor".
        return undefined;
      }
    }

    function beginDrag(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
      const hit = queryHit(e);
      if (!hit) return;
      e.preventDefault();
      map.dragPan.disable();
      setDragState({
        dayId: String(hit.properties?.dayId),
        segIndex: Number(hit.properties?.segIndex),
      });
      setGhostPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }

    function onMove(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
      if (!dragStateRef.current) return;
      setGhostPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }

    function endDrag() {
      const currentDragState = dragStateRef.current;
      const currentGhostPoint = ghostPointRef.current;
      map.dragPan.enable();
      if (currentDragState && currentGhostPoint) {
        commitDragEnd(currentDragState, currentGhostPoint);
      }
      setDragState(null);
      setGhostPoint(null);
    }

    map.on("mousedown", beginDrag);
    map.on("touchstart", beginDrag);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove);
    map.on("mouseup", endDrag);
    map.on("touchend", endDrag);

    return () => {
      wakeTimers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", wakeUp);
      window.removeEventListener("orientationchange", wakeUp);
      document.removeEventListener("visibilitychange", wakeUp);
      resizeObserver.disconnect();
      Object.values(startMarkersRef.current).forEach((m) => m.remove());
      Object.values(stepMarkersRef.current).forEach((m) => m.remove());
      startMarkersRef.current = {};
      stepMarkersRef.current = {};
      viaMarkersRef.current.forEach((m) => m.remove());
      ghostMarkerRef.current?.remove();
      gemMarkersRef.current.forEach((m) => m.remove());
      liveMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      isMapInitialized.current = false;
    };
  }, []);

  // ---- cursor feedback for the current interaction mode ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = placingGem ? "crosshair" : dragState ? "grabbing" : "";
  }, [placingGem, dragState]);

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

  // ---- sync route line sources/layers onto the map ----
  // (gated on isStyleLoaded()/'styledata' below, not on the React `ready`
  // flag — that only flips on the 'load' event, which needs a render frame
  // and can lag well behind the style actually being parsed and queryable)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || daysToRender.length === 0) return;

    function applyRoutes() {
      if (!map) return;
      const desiredIds = new Set<string>();

      daysToRender.forEach(({ day, index }) => {
        day.steps.forEach((step, i) => {
          const route = day.routes[i];
          const from = pointBefore(day, i);
          const to: LatLng = { lat: step.lat, lng: step.lng };
          const srcId = lineSourceId(day.id, i);
          desiredIds.add(srcId);

          const coords = route.geometry.length >= 2 ? route.geometry : [from, to];
          // isCompleted rides on the feature itself (not a separate paint
          // call) so the line-opacity expression below re-evaluates it
          // automatically on every setData — no removeLayer/addLayer, and
          // no per-property update call, needed just to fade a finished leg.
          const geojson = toGeoJSONLine(coords, { dayId: day.id, segIndex: i, isCompleted: step.completed });
          const color = dayColor(index);
          const routable = ROUTABLE_MODES.includes(route.mode);
          const signature = route.mode;

          const existingSource = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
          if (existingSource && routeSignaturesRef.current.get(srcId) === signature) {
            existingSource.setData(geojson);
            if (map.getLayer(`${srcId}-line`)) {
              map.setPaintProperty(`${srcId}-line`, "line-color", color);
            }
            return;
          }

          if (map.getLayer(`${srcId}-hit`)) map.removeLayer(`${srcId}-hit`);
          if (map.getLayer(`${srcId}-line`)) map.removeLayer(`${srcId}-line`);
          if (map.getSource(srcId)) map.removeSource(srcId);

          map.addSource(srcId, { type: "geojson", data: geojson });
          map.addLayer({
            id: `${srcId}-line`,
            type: "line",
            source: srcId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": color,
              "line-width": 5,
              // Data-driven so a done-toggle just needs setData (above) to
              // fade the segment — a finished leg recedes the same way a
              // completed card/marker does elsewhere in the app.
              "line-opacity": ["case", ["==", ["get", "isCompleted"], true], 0.3, 0.85],
              ...(route.mode === "walk"
                ? // A tight dotted pattern reads as a distinct "walking path"
                  // texture, independent of the day-color used for the line
                  // itself — drive stays a plain solid line.
                  { "line-dasharray": [0.3, 1.8] }
                : routable
                  ? {}
                  : { "line-dasharray": [1, 2] }),
            },
          });
          if (routable) {
            map.addLayer({
              id: `${srcId}-hit`,
              type: "line",
              source: srcId,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#000", "line-width": 24, "line-opacity": 0 },
            });
          }
          routeSignaturesRef.current.set(srcId, signature);
        });
      });

      for (const [id] of routeSignaturesRef.current) {
        if (!desiredIds.has(id)) {
          if (map.getLayer(`${id}-hit`)) map.removeLayer(`${id}-hit`);
          if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
          if (map.getSource(id)) map.removeSource(id);
          routeSignaturesRef.current.delete(id);
        }
      }
    }

    if (map.isStyleLoaded()) applyRoutes();
    else map.once("styledata", applyRoutes);
  }, [daysToRender]);

  // ---- start markers (one per rendered day; overview shows all of them) ----
  // Markers don't need the style to be loaded — they're positioned via the
  // map's projection, which is available as soon as the Map is constructed —
  // so this (like the marker effects below) only gates on the map existing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const desiredIds = new Set<string>();

    daysToRender.forEach(({ day, index }) => {
      desiredIds.add(day.id);
      const color = overviewMode ? dayColor(index) : undefined;
      const existing = startMarkersRef.current[day.id];
      if (existing) {
        existing.setLngLat([day.startPoint.lng, day.startPoint.lat]);
        updateStartMarkerEl(existing.getElement() as HTMLDivElement, color);
      } else {
        startMarkersRef.current[day.id] = new maplibregl.Marker({
          element: createStartMarkerEl(color),
          anchor: "center",
        })
          .setLngLat([day.startPoint.lng, day.startPoint.lat])
          .addTo(map);
      }
    });

    Object.keys(startMarkersRef.current).forEach((id) => {
      if (desiredIds.has(id)) return;
      startMarkersRef.current[id].remove();
      delete startMarkersRef.current[id];
    });
  }, [daysToRender, overviewMode]);

  // ---- step markers ----
  // Diffs against the existing marker dictionary instead of
  // remove-everything-then-recreate-everything: an existing marker for a
  // step that's still present gets its position/element updated in place
  // (see updateStepMarkerEl), so toggling one step's completed state no
  // longer visibly flickers every other marker on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const desiredIds = new Set<string>();

    daysToRender.forEach(({ day, index }) => {
      day.steps.forEach((step, i) => {
        desiredIds.add(step.id);
        const color = overviewMode ? dayColor(index) : undefined;
        const active = step.id === activeStepId;
        const existing = stepMarkersRef.current[step.id];

        if (existing) {
          existing.setLngLat([step.lng, step.lat]);
          // maplibre-gl's Marker owns its element's opacity internally (it
          // resets `element.style.opacity` on every render/move tick), so
          // completed-step dimming has to go through this setter rather
          // than touching el.style directly.
          existing.setOpacity(step.completed ? "0.2" : "1");
          const el = existing.getElement() as HTMLDivElement;
          updateStepMarkerEl(el, i + 1, step.category, active, color);
          el.dataset.stepId = step.id;
          el.dataset.dayIndex = String(index);
          return;
        }

        const el = createStepMarkerEl(i + 1, step.category, active, color);
        el.dataset.stepId = step.id;
        el.dataset.dayIndex = String(index);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          // Read everything fresh off the element/stores at click time
          // rather than closing over `step`/`index`/`overviewMode` — this
          // listener is attached once and the marker/element persists
          // across re-renders, so a closure would go stale the moment any
          // of those values changed after creation.
          const clickedId = el.dataset.stepId;
          const clickedDayIndex = Number(el.dataset.dayIndex);
          if (!clickedId) return;
          if (useJourneyStore.getState().panelView === "overview") {
            useTripStore.getState().setActiveDayIndex(clickedDayIndex);
            useJourneyStore.getState().setSavedDayIndex(clickedDayIndex);
            useJourneyStore.getState().setPanelView("day");
          }
          useTripStore.getState().setActiveStepId(clickedId);
          useJourneyStore.getState().setSheetExpanded(true);
          scrollToStepCard(clickedId);
        });
        stepMarkersRef.current[step.id] = new maplibregl.Marker({
          element: el,
          anchor: "center",
          opacity: step.completed ? "0.2" : "1",
        })
          .setLngLat([step.lng, step.lat])
          .addTo(map);
      });
    });

    Object.keys(stepMarkersRef.current).forEach((id) => {
      if (desiredIds.has(id)) return;
      stepMarkersRef.current[id].remove();
      delete stepMarkersRef.current[id];
    });
  }, [daysToRender, activeStepId, overviewMode]);

  // ---- draggable manual-waypoint ("via") markers ----
  // Only for the single active day being edited — overview mode has no one
  // "current" route to bend, same rationale as hitLayerIds above.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!day || overviewMode) {
      viaMarkersRef.current.forEach((m) => m.remove());
      viaMarkersRef.current = [];
      return;
    }

    viaMarkersRef.current.forEach((m) => m.remove());
    const markers: maplibregl.Marker[] = [];
    day.steps.forEach((step, i) => {
      const route = day.routes[i];
      route.manualWaypoints.forEach((wp, viaIndex) => {
        const el = createViaMarkerEl();
        el.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          useTripStore.getState().removeManualWaypoint(day.id, i, viaIndex);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          useTripStore
            .getState()
            .updateManualWaypoint(day.id, i, viaIndex, { lat: lngLat.lat, lng: lngLat.lng });
        });
        markers.push(marker);
      });
    });
    viaMarkersRef.current = markers;
  }, [day, overviewMode]);

  // ---- ghost preview marker while dragging a new via point onto the route ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!ghostPoint) {
      ghostMarkerRef.current?.remove();
      ghostMarkerRef.current = null;
      return;
    }
    if (!ghostMarkerRef.current) {
      ghostMarkerRef.current = new maplibregl.Marker({ element: createGhostMarkerEl(), anchor: "center" });
    }
    ghostMarkerRef.current.setLngLat([ghostPoint.lng, ghostPoint.lat]).addTo(map);
  }, [ghostPoint]);

  // ---- hidden gem markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    gemMarkersRef.current.forEach((m) => m.remove());
    gemMarkersRef.current = trip.hiddenGems.map((gem) => {
      const el = createGemMarkerEl();
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        useTripStore.getState().setActiveGemId(gem.id);
      });
      return new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([gem.lng, gem.lat])
        .addTo(map);
    });
  }, [trip.hiddenGems]);

  // ---- live location marker ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!liveLocation) {
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      return;
    }
    if (!liveMarkerRef.current) {
      liveMarkerRef.current = new maplibregl.Marker({ element: createLiveLocationMarkerEl(), anchor: "center" });
    }
    liveMarkerRef.current.setLngLat([liveLocation.lng, liveLocation.lat]).addTo(map);
  }, [liveLocation]);

  // ---- gently pan the camera to follow the live location while tracking ----
  useEffect(() => {
    if (!ready || !liveLocation || !mapRef.current) return;
    try {
      mapRef.current.easeTo({ center: [liveLocation.lng, liveLocation.lat], duration: 1200 });
    } catch {
      // ignore — same defensive rationale as the fitBounds call below
    }
  }, [ready, liveLocation]);

  // ---- fit bounds once per day switch (or once per entry into overview) ----
  useEffect(() => {
    if (!ready || !mapRef.current || daysToRender.length === 0) return;
    const fitKey = overviewMode ? "__overview__" : day?.id ?? null;
    if (!fitKey || fitDayIdRef.current === fitKey) return;
    fitDayIdRef.current = fitKey;
    const points = daysToRender.flatMap(({ day }) => [
      day.startPoint,
      ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng })),
    ]);
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
  }, [ready, day, overviewMode, daysToRender]);

  return (
    <div className="fixed inset-0 z-0 h-screen w-screen overflow-hidden">
      <div
        ref={mapContainer}
        className="absolute inset-0 sepia-[.15] hue-rotate-[65deg] saturate-[0.8] contrast-[0.9]"
      />

      {!day && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 text-stone-400">
          No day selected
        </div>
      )}

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
          ✨ {placingGem ? "Click the map to drop it…" : "Drop Hidden Gem"}
        </button>
      )}

      {pendingGemPoint && (
        <HiddenGemCreateForm
          point={pendingGemPoint}
          onCancel={() => setPendingGemPoint(null)}
          onSave={(note, geoLocked, name) => {
            useTripStore.getState().addHiddenGem(pendingGemPoint, note, geoLocked, name);
            setPendingGemPoint(null);
          }}
        />
      )}
    </div>
  );
}
