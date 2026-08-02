import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Day, HiddenGem, LatLng, RouteSegment, Step, TransportMode, Trip } from "@/lib/types";
import { ROUTABLE_MODES } from "@/lib/types";
import type { PlaceCategory } from "@/lib/categories";
import { estimateDurationMin, haversineMeters } from "@/lib/geo";
import { recomputeDayTimes } from "@/lib/time";
import { genId } from "@/lib/id";
import { pointBefore } from "@/lib/dayHelpers";
import { normalizeTrip } from "@/lib/normalize";

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
    // Routable modes (walk/drive) need a real OSRM fetch before this
    // placeholder straight line is fit to actually render — see MapView's
    // route-sync effect. Transit/ferry have no fetch to wait for, so their
    // straight-line schematic is the final answer already.
    geometryResolved: !ROUTABLE_MODES.includes(mode),
    resetNonce: 0,
  };
}

/** Rebuilds routes[] to match steps[] 1:1, preserving each segment's chosen mode by
 *  matching on the destination step's id — a structural change (add/remove/reorder)
 *  means the two endpoints may have changed, so every segment gets a fresh route. */
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

// Marking done now — swap the planned duration for how long the stop
// actually took (arrival -> now), so every later ETA in the day shifts to
// reflect real progress instead of the original static schedule.
function applyCompletionTimeShift(step: Step) {
  if (!step.arrival) return;
  const [h, m] = step.arrival.split(":").map(Number);
  const arrivalToday = new Date();
  arrivalToday.setHours(h, m, 0, 0);
  const elapsedMin = Math.round((Date.now() - arrivalToday.getTime()) / 60000);
  if (elapsedMin >= 1) {
    step.durationMin = elapsedMin;
  }
}

function snapshotTrip(trip: Trip): Trip {
  return JSON.parse(JSON.stringify(trip));
}

export type SaveState = "idle" | "saving" | "saved";

interface TripState {
  trip: Trip;
  activeDayIndex: number;
  activeStepId: string | null;
  activeGemId: string | null;
  saveState: SaveState;
  past: Trip[];
  future: Trip[];

  setTrip: (trip: Trip) => void;
  setTripTitle: (title: string) => void;
  setActiveDayIndex: (index: number) => void;
  setActiveStepId: (id: string | null) => void;
  setActiveGemId: (id: string | null) => void;
  setSaveState: (state: SaveState) => void;

  undo: () => void;
  redo: () => void;

  addDay: () => void;
  removeDay: (dayId: string) => void;

  setDayLabel: (dayId: string, label: string) => void;
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
  toggleStepCompleted: (dayId: string, stepId: string) => void;

  toggleChecklistItem: (dayId: string, stepId: string, itemId: string) => void;
  addChecklistItem: (dayId: string, stepId: string, label: string) => void;
  removeChecklistItem: (dayId: string, stepId: string, itemId: string) => void;

  setSegmentMode: (dayId: string, segIndex: number, mode: TransportMode) => void;
  setTransitLine: (dayId: string, segIndex: number, line: string) => void;
  setRouteFound: (
    dayId: string,
    segIndex: number,
    info: {
      distanceM: number;
      durationMin: number;
      geometry: LatLng[];
      geometryResolved: boolean;
      geometryDegraded?: boolean;
    }
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

  /** Replaces the trip's hidden-gem list wholesale — used by the background
   *  poll that pulls in gems the Game Master placed via the Admin panel. */
  setHiddenGems: (gems: HiddenGem[]) => void;

  addUnplannedPlace: (place: {
    name: string;
    lat: number;
    lng: number;
    category?: PlaceCategory;
  }) => void;
  removeUnplannedPlace: (id: string) => void;
  moveUnplannedToDay: (id: string, dayId: string) => void;
}

function findDay(trip: Trip, dayId: string) {
  const index = trip.days.findIndex((d) => d.id === dayId);
  return { index, day: trip.days[index] };
}

/** Every content-mutating action calls this first, snapshotting the trip as it
 *  was *before* the mutation onto the undo stack and clearing any redo stack. */
function recordHistory(state: { trip: Trip; past: Trip[]; future: Trip[] }) {
  state.past.push(snapshotTrip(state.trip));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
}

export const useTripStore = create<TripState>()(
  immer((set) => ({
    trip: { id: genId(), title: "New Trip", days: [], hiddenGems: [], unplanned: [] },
    activeDayIndex: 0,
    activeStepId: null,
    activeGemId: null,
    saveState: "idle",
    past: [],
    future: [],

    setTrip: (trip) =>
      set((state) => {
        state.trip = normalizeTrip(trip);
        state.activeDayIndex = 0;
        state.activeStepId = null;
        state.past = [];
        state.future = [];
      }),

    setSaveState: (saveState) =>
      set((state) => {
        state.saveState = saveState;
      }),

    setTripTitle: (title) =>
      set((state) => {
        recordHistory(state);
        state.trip.title = title;
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

    setActiveGemId: (id) =>
      set((state) => {
        state.activeGemId = id;
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

    addDay: () =>
      set((state) => {
        recordHistory(state);
        const n = state.trip.days.length + 1;
        const lastDay = state.trip.days[state.trip.days.length - 1];
        state.trip.days.push({
          id: genId(),
          label: `Day ${n}`,
          startTime: "09:00",
          startPoint: lastDay ? lastDay.startPoint : { name: "Meeting point", lat: 41.0082, lng: 28.9784 },
          steps: [],
          routes: [],
        });
        state.activeDayIndex = state.trip.days.length - 1;
        state.activeStepId = null;
      }),

    removeDay: (dayId) =>
      set((state) => {
        if (state.trip.days.length <= 1) return;
        const idx = state.trip.days.findIndex((d) => d.id === dayId);
        if (idx === -1) return;
        recordHistory(state);
        state.trip.days.splice(idx, 1);
        state.activeDayIndex = Math.min(state.activeDayIndex, state.trip.days.length - 1);
        state.activeStepId = null;
      }),

    setDayLabel: (dayId, label) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        recordHistory(state);
        day.label = label;
      }),

    setDayStartTime: (dayId, value) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        recordHistory(state);
        day.startTime = value;
        recalcDay(day);
      }),

    setDayStartPoint: (dayId, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        recordHistory(state);
        day.startPoint = point;
        day.routes = rebuildRoutes(day);
        recalcDay(day);
      }),

    addStep: (dayId, place) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        recordHistory(state);
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
          completed: false,
        };
        day.steps.push(step);
        day.routes.push(makeRoute(from, place, "walk"));
        recalcDay(day);
      }),

    removeStep: (dayId, stepId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        if (!day) return;
        recordHistory(state);
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
        recordHistory(state);
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
        recordHistory(state);
        Object.assign(step, patch);
        recalcDay(day);
      }),

    toggleStepCompleted: (dayId, stepId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!day || !step) return;
        recordHistory(state);
        const wasCompleted = step.completed;
        step.completed = !wasCompleted;
        if (!wasCompleted) applyCompletionTimeShift(step);
        recalcDay(day);
      }),

    toggleChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        const item = step?.checklist.find((c) => c.id === itemId);
        if (!day || !step || !item) return;
        recordHistory(state);
        item.done = !item.done;
        // A checklist reaching 100% closes the ring the same way tapping the
        // master toggle directly would — same ETA-shift math — so ticking
        // off the last to-do behaves consistently with marking done by hand.
        if (step.checklist.length > 0) {
          const allDone = step.checklist.every((c) => c.done);
          if (allDone && !step.completed) {
            step.completed = true;
            applyCompletionTimeShift(step);
          } else if (!allDone && step.completed) {
            step.completed = false;
          }
          recalcDay(day);
        }
      }),

    addChecklistItem: (dayId, stepId, label) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step || !label.trim()) return;
        recordHistory(state);
        step.checklist.push({ id: genId(), label: label.trim(), done: false });
      }),

    removeChecklistItem: (dayId, stepId, itemId) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const step = day?.steps.find((s) => s.id === stepId);
        if (!step) return;
        recordHistory(state);
        step.checklist = step.checklist.filter((c) => c.id !== itemId);
      }),

    setSegmentMode: (dayId, segIndex, mode) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        recordHistory(state);
        const from = pointBefore(day, segIndex);
        const to = day.steps[segIndex];
        const fresh = makeRoute(from, to, mode);
        fresh.resetNonce = route.resetNonce + 1;
        day.routes[segIndex] = fresh;
        recalcDay(day);
      }),

    setTransitLine: (dayId, segIndex, line) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        recordHistory(state);
        route.transitLine = line.trim() || undefined;
      }),

    setRouteFound: (dayId, segIndex, info) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        route.distanceM = info.distanceM;
        route.durationMin = info.durationMin;
        route.geometry = info.geometry;
        route.geometryResolved = info.geometryResolved;
        route.geometryDegraded = info.geometryDegraded ?? false;
        recalcDay(day);
      }),

    insertManualWaypoint: (dayId, segIndex, insertAt, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        recordHistory(state);
        route.manualWaypoints.splice(insertAt, 0, point);
        route.isManual = true;
      }),

    updateManualWaypoint: (dayId, segIndex, waypointIndex, point) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route || !route.manualWaypoints[waypointIndex]) return;
        recordHistory(state);
        route.manualWaypoints[waypointIndex] = point;
      }),

    removeManualWaypoint: (dayId, segIndex, waypointIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!route) return;
        recordHistory(state);
        route.manualWaypoints.splice(waypointIndex, 1);
        route.isManual = route.manualWaypoints.length > 0;
      }),

    resetRouteToAuto: (dayId, segIndex) =>
      set((state) => {
        const { day } = findDay(state.trip, dayId);
        const route = day?.routes[segIndex];
        if (!day || !route) return;
        recordHistory(state);
        const from = pointBefore(day, segIndex);
        const to = day.steps[segIndex];
        const fresh = makeRoute(from, to, route.mode);
        fresh.resetNonce = route.resetNonce + 1;
        day.routes[segIndex] = fresh;
        recalcDay(day);
      }),

    // Not run through recordHistory/undo — this mirrors gems the Game Master
    // placed via the Admin Hidden Gem Studio, not a local edit the player
    // made, so it shouldn't be something the player's own Ctrl+Z can revert.
    setHiddenGems: (gems) =>
      set((state) => {
        state.trip.hiddenGems = gems;
      }),

    addUnplannedPlace: (place) =>
      set((state) => {
        recordHistory(state);
        state.trip.unplanned.push({
          id: genId(),
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category ?? "other",
          notes: "",
        });
      }),

    removeUnplannedPlace: (id) =>
      set((state) => {
        recordHistory(state);
        state.trip.unplanned = state.trip.unplanned.filter((p) => p.id !== id);
      }),

    moveUnplannedToDay: (id, dayId) =>
      set((state) => {
        const place = state.trip.unplanned.find((p) => p.id === id);
        const { day } = findDay(state.trip, dayId);
        if (!place || !day) return;
        recordHistory(state);
        const from = day.steps.length > 0 ? day.steps[day.steps.length - 1] : day.startPoint;
        const step: Step = {
          id: genId(),
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
          durationMin: 60,
          notes: place.notes,
          checklist: [],
          completed: false,
        };
        day.steps.push(step);
        day.routes.push(makeRoute(from, place, "walk"));
        recalcDay(day);
        state.trip.unplanned = state.trip.unplanned.filter((p) => p.id !== id);
      }),
  }))
);
