import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Day, LatLng, RouteSegment, Step, TransportMode, Trip } from "@/lib/types";
import { estimateDurationMin, haversineMeters } from "@/lib/geo";
import { recomputeDayTimes } from "@/lib/time";
import { genId } from "@/lib/id";
import { pointBefore } from "@/lib/dayHelpers";

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

interface TripState {
  trip: Trip;
  activeDayIndex: number;
  activeStepId: string | null;

  setTrip: (trip: Trip) => void;
  setActiveDayIndex: (index: number) => void;
  setActiveStepId: (id: string | null) => void;

  setDayStartTime: (dayId: string, value: string) => void;
  setDayStartPoint: (dayId: string, point: { name: string; lat: number; lng: number }) => void;

  addStep: (dayId: string, place: { name: string; lat: number; lng: number }) => void;
  removeStep: (dayId: string, stepId: string) => void;
  reorderSteps: (dayId: string, fromIndex: number, toIndex: number) => void;
  updateStep: (
    dayId: string,
    stepId: string,
    patch: Partial<Pick<Step, "name" | "notes" | "durationMin">>
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
  setManualEdit: (dayId: string, segIndex: number, waypoints: LatLng[]) => void;
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

    setTrip: (trip) =>
      set((state) => {
        state.trip = trip;
        state.activeDayIndex = 0;
        state.activeStepId = null;
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

    setDayStartTime: (dayId, value) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        day.startTime = value;
        recalcDay(day);
      }),

    setDayStartPoint: (dayId, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        day.startPoint = point;
        day.routes = rebuildRoutes(day);
        recalcDay(day);
      }),

    addStep: (dayId, place) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        const from = day.steps.length > 0 ? day.steps[day.steps.length - 1] : day.startPoint;
        const step: Step = {
          id: genId(),
          name: place.name,
          lat: place.lat,
          lng: place.lng,
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
        Object.assign(step, patch);
        recalcDay(day);
      }),

    toggleChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        const item = step?.checklist.find((c) => c.id === itemId);
        if (item) item.done = !item.done;
      }),

    addChecklistItem: (dayId, stepId, label) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step || !label.trim()) return;
        step.checklist.push({ id: genId(), label: label.trim(), done: false });
      }),

    removeChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step) return;
        step.checklist = step.checklist.filter((c) => c.id !== itemId);
      }),

    setSegmentMode: (dayId, segIndex, mode) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
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

    setManualEdit: (dayId, segIndex, waypoints) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        route.manualWaypoints = waypoints;
        route.isManual = waypoints.length > 0;
      }),

    resetRouteToAuto: (dayId, segIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        const from = pointBefore(day, segIndex);
        const to = day.steps[segIndex];
        const fresh = makeRoute(from, to, route.mode);
        fresh.resetNonce = route.resetNonce + 1;
        day.routes[segIndex] = fresh;
        recalcDay(day);
      }),
  }))
);
