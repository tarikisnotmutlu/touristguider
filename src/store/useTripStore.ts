import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Day, LatLng, RouteSegment, Step, TransportMode, Trip } from "@/lib/types";
import type { PlaceCategory } from "@/lib/categories";
import { estimateDurationMin, haversineMeters } from "@/lib/geo";
import { recomputeDayTimes } from "@/lib/time";
import { genId } from "@/lib/id";
import { pointBefore } from "@/lib/dayHelpers";

const HISTORY_LIMIT = 50;

function makeRoute(from: LatLng, to: LatLng, mode: TransportMode): RouteSegment {
  const distanceM = haversineMeters(from, to);
  return {
    mode,
    distanceM,
    durationMin: estimateDurationMin(distanceM, mode),
    isManual: false,
    manualWaypoints: [],
    geometry: [from, to],
    resetNonce: 0,
  };
}

/** Rebuilds routes[] to match steps[] 1:1, preserving each segment's chosen mode by
 *  matching on the destination step's id, but always dropping manual waypoints since
 *  a structural change (add/remove/reorder) means the two endpoints may have changed. */
function rebuildRoutes(day: Day): RouteSegment[] {
  const oldByToStepId = new Map(day.steps.map((s, i) => [s.id, day.routes[i]]));
  return day.steps.map((step, i) => {
    const from = pointBefore(day, i);
    const prevMode = oldByToStepId.get(step.id)?.mode ?? "walk";
    return makeRoute(from, step, prevMode);
  });
}

function recalcDay(day: Day) {
  day.steps = recomputeDayTimes(day);
}

function snapshotTrip(trip: Trip): Trip {
  return JSON.parse(JSON.stringify(trip));
}

export type SaveState = "idle" | "saving" | "saved";

interface TripState {
  trip: Trip;
  activeDayIndex: number;
  activeStepId: string | null;
  saveState: SaveState;
  past: Trip[];
  future: Trip[];

  setTrip: (trip: Trip) => void;
  setActiveDayIndex: (index: number) => void;
  setActiveStepId: (id: string | null) => void;
  setSaveState: (state: SaveState) => void;

  undo: () => void;
  redo: () => void;

  setDayStartTime: (dayId: string, value: string) => void;
  setDayStartPoint: (dayId: string, point: { name: string; lat: number; lng: number }) => void;

  addStep: (
    dayId: string,
    place: { name: string; lat: number; lng: number; category?: PlaceCategory }
  ) => void;
  removeStep: (dayId: string, stepId: string) => void;
  reorderSteps: (dayId: string, fromIndex: number, toIndex: number) => void;
  updateStep: (
    dayId: string,
    stepId: string,
    patch: Partial<Pick<Step, "name" | "notes" | "durationMin" | "category">>
  ) => void;

  toggleChecklistItem: (dayId: string, stepId: string, itemId: string) => void;
  addChecklistItem: (dayId: string, stepId: string, label: string) => void;
  removeChecklistItem: (dayId: string, stepId: string, itemId: string) => void;

  setSegmentMode: (dayId: string, segIndex: number, mode: TransportMode) => void;
  setRouteFound: (
    dayId: string,
    segIndex: number,
    info: { distanceM: number; durationMin: number; geometry: LatLng[] }
  ) => void;
  insertManualWaypoint: (
    dayId: string,
    segIndex: number,
    insertAt: number,
    point: LatLng
  ) => void;
  updateManualWaypoint: (
    dayId: string,
    segIndex: number,
    waypointIndex: number,
    point: LatLng
  ) => void;
  removeManualWaypoint: (dayId: string, segIndex: number, waypointIndex: number) => void;
  resetRouteToAuto: (dayId: string, segIndex: number) => void;
}

function findDay(trip: Trip, dayId: string) {
  const index = trip.days.findIndex((d) => d.id === dayId);
  return { index, day: trip.days[index] };
}

export const useTripStore = create<TripState>()(
  immer((set) => ({
    trip: { id: genId(), title: "New Trip", days: [] },
    activeDayIndex: 0,
    activeStepId: null,
    saveState: "idle",
    past: [],
    future: [],

    setTrip: (trip) =>
      set((state) => {
        state.trip = trip;
        state.activeDayIndex = 0;
        state.activeStepId = null;
        state.past = [];
        state.future = [];
      }),

    setSaveState: (saveState) =>
      set((state) => {
        state.saveState = saveState;
      }),

    setActiveDayIndex: (index) =>
      set((state) => {
        state.activeDayIndex = index;
        state.activeStepId = null;
      }),

    setActiveStepId: (id) =>
      set((state) => {
        state.activeStepId = id;
      }),

    undo: () =>
      set((state) => {
        const previous = state.past.pop();
        if (!previous) return;
        state.future.unshift(snapshotTrip(state.trip));
        if (state.future.length > HISTORY_LIMIT) state.future.pop();
        state.trip = previous;
        state.activeDayIndex = Math.min(state.activeDayIndex, Math.max(0, state.trip.days.length - 1));
        state.activeStepId = null;
      }),

    redo: () =>
      set((state) => {
        const next = state.future.shift();
        if (!next) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.trip = next;
        state.activeDayIndex = Math.min(state.activeDayIndex, Math.max(0, state.trip.days.length - 1));
        state.activeStepId = null;
      }),

    setDayStartTime: (dayId, value) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        day.startTime = value;
        recalcDay(day);
      }),

    setDayStartPoint: (dayId, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        day.startPoint = point;
        day.routes = rebuildRoutes(day);
        recalcDay(day);
      }),

    addStep: (dayId, place) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        const from = day.steps.length > 0 ? day.steps[day.steps.length - 1] : day.startPoint;
        const step: Step = {
          id: genId(),
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category ?? "other",
          durationMin: 60,
          notes: "",
          checklist: [],
        };
        day.steps.push(step);
        day.routes.push(makeRoute(from, place, "walk"));
        recalcDay(day);
      }),

    removeStep: (dayId, stepId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        day.steps = day.steps.filter((s) => s.id !== stepId);
        day.routes = rebuildRoutes(day);
        recalcDay(day);
      }),

    reorderSteps: (dayId, fromIndex, toIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        const steps = day.steps;
        if (
          fromIndex < 0 ||
          fromIndex >= steps.length ||
          toIndex < 0 ||
          toIndex >= steps.length
        )
          return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        const [moved] = steps.splice(fromIndex, 1);
        steps.splice(toIndex, 0, moved);
        day.routes = rebuildRoutes(day);
        recalcDay(day);
      }),

    updateStep: (dayId, stepId, patch) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        const step = day.steps.find((s) => s.id === stepId);
        if (!step) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        Object.assign(step, patch);
        recalcDay(day);
      }),

    toggleChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        const item = step?.checklist.find((c) => c.id === itemId);
        if (!item) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        item.done = !item.done;
      }),

    addChecklistItem: (dayId, stepId, label) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step || !label.trim()) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        step.checklist.push({ id: genId(), label: label.trim(), done: false });
      }),

    removeChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        step.checklist = step.checklist.filter((c) => c.id !== itemId);
      }),

    setSegmentMode: (dayId, segIndex, mode) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        const from = pointBefore(day, segIndex);
        const to = day.steps[segIndex];
        const fresh = makeRoute(from, to, mode);
        fresh.resetNonce = route.resetNonce + 1;
        day.routes[segIndex] = fresh;
        recalcDay(day);
      }),

    setRouteFound: (dayId, segIndex, info) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        route.distanceM = info.distanceM;
        route.durationMin = info.durationMin;
        route.geometry = info.geometry;
        recalcDay(day);
      }),

    insertManualWaypoint: (dayId, segIndex, insertAt, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        route.manualWaypoints.splice(insertAt, 0, point);
        route.isManual = true;
      }),

    updateManualWaypoint: (dayId, segIndex, waypointIndex, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route || !route.manualWaypoints[waypointIndex]) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        route.manualWaypoints[waypointIndex] = point;
      }),

    removeManualWaypoint: (dayId, segIndex, waypointIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        route.manualWaypoints.splice(waypointIndex, 1);
        route.isManual = route.manualWaypoints.length > 0;
      }),

    resetRouteToAuto: (dayId, segIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        state.past.push(snapshotTrip(state.trip));
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
        const from = pointBefore(day, segIndex);
        const to = day.steps[segIndex];
        const fresh = makeRoute(from, to, route.mode);
        fresh.resetNonce = route.resetNonce + 1;
        day.routes[segIndex] = fresh;
        recalcDay(day);
      }),
  }))
);
