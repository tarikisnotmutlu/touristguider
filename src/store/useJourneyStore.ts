import { create } from "zustand";
import type { LatLng } from "@/lib/types";

/**
 * Ephemeral "real-life RPG" state for the live trip experience — deliberately
 * separate from useTripStore (the persisted itinerary + undo history). None of
 * this is saved or shareable: it resets on reload, same as a session HUD would.
 */

// Full-to-empty over these many seconds — tuned to be noticeable within a demo
// session rather than a literal real-world day.
const HUNGER_DECAY_PER_SEC = 100 / (20 * 60);
const THIRST_DECAY_PER_SEC = 100 / (12 * 60);
const FATIGUE_RECOVERY_PER_SEC = 100 / 90;
const WATER_BOOST = 30;
const MEAL_BOOST = 40;
/** ~1300 steps/km, scaled down so a full day of walking reads as meaningful
 *  fatigue without instantly maxing the bar out on the first stop. */
const FATIGUE_PER_METER = (1.3 / 1000) * 6;

export interface ArrivalInfo {
  stepId: string;
  stepName: string;
}

interface JourneyState {
  isEditMode: boolean;
  toggleEditMode: () => void;

  dayStarted: boolean;
  liveLocation: LatLng | null;
  watchId: number | null;
  startDay: () => void;
  stopDay: () => void;
  setWatchId: (id: number | null) => void;
  setLiveLocation: (loc: LatLng | null) => void;

  fatigue: number;
  hunger: number;
  thirst: number;
  addFatigue: (amount: number) => void;
  feed: (amount: number) => void;
  drinkWater: () => void;
  tickDecay: (seconds: number) => void;
  tickRecovery: (seconds: number) => void;

  restingStepId: string | null;
  setRestingStepId: (id: string | null) => void;

  catsPetted: number;
  lastCatMilestone: number | null;
  petCat: () => void;
  clearCatMilestone: () => void;

  arrival: ArrivalInfo | null;
  celebratedStepIds: string[];
  triggerArrival: (stepId: string, stepName: string) => void;
  clearArrival: () => void;
}

const CAT_MILESTONES = [1, 5, 10, 25, 50];

export const useJourneyStore = create<JourneyState>()((set, get) => ({
  isEditMode: false,
  toggleEditMode: () => set((s) => ({ isEditMode: !s.isEditMode })),

  dayStarted: false,
  liveLocation: null,
  watchId: null,
  startDay: () => set({ dayStarted: true }),
  stopDay: () => {
    const id = get().watchId;
    if (id != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(id);
    }
    set({ dayStarted: false, watchId: null, liveLocation: null, restingStepId: null });
  },
  setWatchId: (id) => set({ watchId: id }),
  setLiveLocation: (loc) => set({ liveLocation: loc }),

  fatigue: 0,
  hunger: 100,
  thirst: 100,
  addFatigue: (amount) => set((s) => ({ fatigue: Math.min(100, Math.max(0, s.fatigue + amount)) })),
  feed: (amount) => set((s) => ({ hunger: Math.min(100, s.hunger + amount) })),
  drinkWater: () => {
    set((s) => ({ thirst: Math.min(100, s.thirst + WATER_BOOST) }));
  },
  tickDecay: (seconds) =>
    set((s) => ({
      hunger: Math.max(0, s.hunger - HUNGER_DECAY_PER_SEC * seconds),
      thirst: Math.max(0, s.thirst - THIRST_DECAY_PER_SEC * seconds),
    })),
  tickRecovery: (seconds) =>
    set((s) => ({ fatigue: Math.max(0, s.fatigue - FATIGUE_RECOVERY_PER_SEC * seconds) })),

  restingStepId: null,
  setRestingStepId: (id) => set({ restingStepId: id }),

  catsPetted: 0,
  lastCatMilestone: null,
  petCat: () =>
    set((s) => {
      const next = s.catsPetted + 1;
      return {
        catsPetted: next,
        lastCatMilestone: CAT_MILESTONES.includes(next) ? next : s.lastCatMilestone,
      };
    }),
  clearCatMilestone: () => set({ lastCatMilestone: null }),

  arrival: null,
  celebratedStepIds: [],
  triggerArrival: (stepId, stepName) =>
    set((s) => {
      if (s.celebratedStepIds.includes(stepId)) return {};
      return { arrival: { stepId, stepName }, celebratedStepIds: [...s.celebratedStepIds, stepId] };
    }),
  clearArrival: () => set({ arrival: null }),
}));

export { FATIGUE_PER_METER, MEAL_BOOST };
