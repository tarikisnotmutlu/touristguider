"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { ROUTABLE_MODES, type LatLng, type TransportMode } from "@/lib/types";
import { pointBefore } from "@/lib/dayHelpers";
import { bearingDegrees, boundsOf, projectPointOntoPolyline } from "@/lib/geo";
import { dayColor } from "@/lib/dayColors";
import {
  createStepMarkerEl,
  updateStepMarkerEl,
  createStartMarkerEl,
  updateStartMarkerEl,
  createRouteArrowEl,
  createViaMarkerEl,
  createGhostMarkerEl,
  createGemMarkerEl,
  createLiveLocationMarkerEl,
} from "./MapMarkers";

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

// One distinct dash pattern per transport mode so a route's line reads its
// mode at a glance, independent of the day color used for the line itself.
const LINE_DASH_BY_MODE: Record<TransportMode, { "line-dasharray"?: number[] }> = {
  // Tight dots — a "footsteps" texture.
  walk: { "line-dasharray": [0.3, 1.8] },
  // Solid — driving is the only mode with an unbroken line.
  drive: {},
  // Medium dashes, evenly spaced — reads as a scheduled service.
  transit: { "line-dasharray": [2, 1.5] },
  // Long dashes with wide gaps — visually the "sparsest" of the four.
  ferry: { "line-dasharray": [1, 3] },
};

// Transit/ferry legs are a straight-line schematic ("this connection
// exists"), never a real hugged-to-the-street path the way walk/drive are —
// so unlike those two, they don't get the day's accent color. A fixed
// neutral slate instead makes them unmistakable at a glance, even when one
// happens to visually cross paths on screen with a same-day walking route
// (e.g. a long transit hop cutting across the same neighborhood a nearby
// walk connects within) — a dash-pattern difference alone can be too subtle
// to notice at a quick glance/small zoom, and a schematic line sharing the
// day's color reads as "this is the real path" when it isn't.
const SCHEMATIC_LINE_COLOR = "#64748b";

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
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghostPoint, setGhostPoint] = useState<LatLng | null>(null);

  // Mirrors of state read inside stable (bound-once) map event handlers,
  // which otherwise close over stale values.
  const dragStateRef = useRef(dragState);
  const ghostPointRef = useRef(ghostPoint);
  const hitLayerIdsRef = useRef<string[]>([]);

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
  const routeArrowRef = useRef<maplibregl.Marker | null>(null);
  const gemMarkersRef = useRef<maplibregl.Marker[]>([]);
  const liveMarkerRef = useRef<maplibregl.Marker | null>(null);

  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const movingStepId = useJourneyStore((s) => s.movingStepId);
  const movingStartPointDayId = useJourneyStore((s) => s.movingStartPointDayId);
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
    dragStateRef.current = dragState;
  }, [dragState]);
  useEffect(() => {
    ghostPointRef.current = ghostPoint;
  }, [ghostPoint]);

  const hitLayerIds = useMemo(() => {
    // Manual-waypoint dragging only makes sense for a single active day's
    // route being edited — disabled in overview mode (no single "current"
    // route to bend) and, per the strict view/edit split, disabled entirely
    // outside Edit Mode so an accidental drag on the map can never mutate
    // the itinerary while just browsing.
    if (!day || overviewMode || !isEditMode) return [];
    return day.steps
      .map((_, i) => ({ i, mode: day.routes[i]?.mode }))
      .filter(({ mode }) => mode && ROUTABLE_MODES.includes(mode))
      .map(({ i }) => `${lineSourceId(day.id, i)}-hit`);
  }, [day, overviewMode, isEditMode]);
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

    // ---- one-shot "adjust pin location" placement ----
    // Reads straight off the store (always current) rather than a ref mirror
    // — no React state involved in the click path, so there's nothing to go
    // stale. Adding a stop is never done via a map click (see AddCustomStopForm's
    // explicit coordinate paste instead) — this is the ONLY place a plain map
    // click can affect the itinerary at all, and only while repositioning an
    // existing step or the day's start point, never for creating one.
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      const journey = useJourneyStore.getState();
      if (!journey.isEditMode) return;
      const point = { lat: e.lngLat.lat, lng: e.lngLat.lng };

      if (journey.movingStartPointDayId) {
        const dayId = journey.movingStartPointDayId;
        journey.setMovingStartPointDayId(null);
        useTripStore.getState().moveDayStartPoint(dayId, point);
        return;
      }

      if (journey.movingStepId) {
        const stepId = journey.movingStepId;
        journey.setMovingStepId(null);
        const tripState = useTripStore.getState();
        const ownerDay = tripState.trip.days.find((d) => d.steps.some((s) => s.id === stepId));
        if (ownerDay) {
          tripState.moveStep(ownerDay.id, stepId, point);
        }
      }
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
      routeArrowRef.current?.remove();
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
    map.getCanvas().style.cursor =
      dragState ? "grabbing" : movingStepId || movingStartPointDayId ? "crosshair" : "";
  }, [dragState, movingStepId, movingStartPointDayId]);

  // Routes are never fetched live from MapView anymore — per the deferred-
  // OSRM architecture (see tripSync.ts), a session's routes are resolved
  // once up front (createSession) and again only on Save (Edit Mode
  // -> View Mode), never while the map is just rendering. This keeps every
  // add/move/delete/reorder in Edit Mode a pure, instant, local Zustand
  // mutation — the old per-segment retry-fetch loop here was exactly what
  // caused nodes to appear to "delete themselves": a slow, in-flight fetch
  // for an old segIndex could land after further edits had shifted the
  // routes array around and stomp the wrong entry.

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
          const routable = ROUTABLE_MODES.includes(route.mode);
          const isUnresolved = routable && !route.geometryResolved;
          // While Edit Mode is on, routes are never fetched (see the removed
          // fetch effect above) — EVERY routable segment (not just ones that
          // happen to be unresolved) renders as an instant straight line
          // through its endpoints/manual waypoints instead of its last-known
          // curve, kept deliberately simple/synchronous for 60fps dragging.
          // This matters even for a segment that was already resolved
          // before Edit Mode began: `route.geometryResolved` doesn't flip
          // to false just because a waypoint got dragged onto it, so
          // without this the map (and the invisible hit-test line, which
          // shares this same source/geometry) would keep showing/hit-testing
          // the OLD curve — the drag would visually appear to do nothing,
          // and a second drag near the new line's actual on-screen position
          // would increasingly miss the stale hitbox the more the real
          // curve deviates from a straight line. Outside Edit Mode this
          // placeholder never applies (routes are fully resolved by
          // createSession/Save before a viewer ever sees them), but
          // the old "gap, then degrade after retries give up" fallback
          // stays as a safety net for that case.
          const degraded = !isEditMode && isUnresolved && !!route.geometryDegraded;
          const showPlaceholder = isEditMode && routable;

          if (!isEditMode && isUnresolved && !degraded) return;

          desiredIds.add(srcId);

          const coords = showPlaceholder
            ? [from, ...route.manualWaypoints, to]
            : route.geometry.length >= 2
              ? route.geometry
              : [from, to];
          // isCompleted rides on the feature itself (not a separate paint
          // call) so the line-opacity expression below re-evaluates it
          // automatically on every setData — no removeLayer/addLayer, and
          // no per-property update call, needed just to fade a finished leg.
          const geojson = toGeoJSONLine(coords, { dayId: day.id, segIndex: i, isCompleted: step.completed });
          const color = routable ? dayColor(index) : SCHEMATIC_LINE_COLOR;
          // Degraded/placeholder-ness is part of the signature too —
          // resolving for real (or entering/leaving Edit Mode) needs the
          // layer rebuilt with new paint, not just a setData on the existing one.
          const faded = degraded || showPlaceholder;
          const signature = `${route.mode}:${faded}`;

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
              "line-width": faded ? 3 : 5,
              // Data-driven so a done-toggle just needs setData (above) to
              // fade the segment — a finished leg recedes the same way a
              // completed card/marker does elsewhere in the app. A faded
              // (degraded, or an Edit Mode placeholder awaiting Save) line
              // is thinner and more transparent regardless of completion,
              // so it never reads as a confident, final route.
              "line-opacity": faded ? 0.4 : ["case", ["==", ["get", "isCompleted"], true], 0.3, 0.85],
              ...LINE_DASH_BY_MODE[route.mode],
              ...(faded ? { "line-dasharray": [1, 1.5] } : {}),
            },
          });
          // Wide, invisible hit-test line so a drag started anywhere near the
          // (thin, precisely-drawn) visible line still grabs it — used by
          // beginDrag/queryHit above to start bending a route, Edit Mode only
          // (hitLayerIds is empty outside Edit Mode, so this layer is never
          // queried against there even though it still exists).
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
  }, [daysToRender, isEditMode]);

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
  // "current" route to bend, same rationale as hitLayerIds above. Drag and
  // dblclick-to-remove are both gated on Edit Mode: outside it these render
  // as plain, non-draggable, non-removable markers so a stray tap or drag
  // gesture while just browsing can never touch the itinerary.
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
        if (isEditMode) {
          el.addEventListener("dblclick", (ev) => {
            ev.stopPropagation();
            useTripStore.getState().removeManualWaypoint(day.id, i, viaIndex);
          });
        }
        const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: isEditMode })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);
        if (isEditMode) {
          marker.on("dragend", () => {
            const lngLat = marker.getLngLat();
            useTripStore
              .getState()
              .updateManualWaypoint(day.id, i, viaIndex, { lat: lngLat.lat, lng: lngLat.lng });
          });
        }
        markers.push(marker);
      });
    });
    viaMarkersRef.current = markers;
  }, [day, overviewMode, isEditMode]);

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

  // ---- small blinking arrow on the active step's route ----
  // Only for the single active day being viewed — overview mode has no one
  // "current" leg to point at, same rationale as the old hit-testing above.
  // Placed at the geometric midpoint of the resolved route geometry (not the
  // crude midpoint of the two endpoints), so it actually sits on the curved
  // path rather than floating off to one side of a bend.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const stepIndex = day && !overviewMode ? day.steps.findIndex((s) => s.id === activeStepId) : -1;
    if (stepIndex === -1 || !day) {
      routeArrowRef.current?.remove();
      routeArrowRef.current = null;
      return;
    }

    const route = day.routes[stepIndex];
    const from = pointBefore(day, stepIndex);
    const to: LatLng = { lat: day.steps[stepIndex].lat, lng: day.steps[stepIndex].lng };
    const geometry = route.geometry.length >= 2 ? route.geometry : [from, to];
    const midIndex = Math.min(geometry.length - 1, Math.floor(geometry.length / 2));
    const point = geometry[midIndex];
    const next = geometry[Math.min(geometry.length - 1, midIndex + 1)];
    const bearing = bearingDegrees(point, next.lat === point.lat && next.lng === point.lng ? to : next);

    routeArrowRef.current?.remove();
    routeArrowRef.current = new maplibregl.Marker({ element: createRouteArrowEl(bearing), anchor: "center" })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
  }, [day, overviewMode, activeStepId]);

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
      {/* The sepia/hue-rotate/saturate/contrast tint lives on .maplibregl-canvas
          itself (globals.css), not here — this container is the shared parent
          of both the canvas AND every DOM marker, and a CSS filter on a shared
          ancestor forces the browser to composite the whole subtree as one
          rasterized layer every frame. During a pan that fights with
          MapLibre's own per-frame `transform` updates on markers, which is
          what read as markers "wobbling" and lagging behind the map. */}
      <div ref={mapContainer} className="tg-tinted-map absolute inset-0" />

      {!day && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 text-stone-400">
          No day selected
        </div>
      )}

      {/* Adding a stop is never a map click anymore — see Timeline's
          "Add a stop" search box and coordinate-paste form instead. A plain
          map click is now only ever a no-op, except for the one-shot
          "adjust pin location" flow (see the click handler above). */}
    </div>
  );
}
