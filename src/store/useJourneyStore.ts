import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LatLng } from "@/lib/types";
import { istanbulDateString } from "@/lib/istanbulDate";
import { GM_ACTION_MESSAGE, type GmAction } from "@/lib/telemetry";

/**
 * Ephemeral "real-life RPG" state for the live trip experience — deliberately
 * separate from useTripStore (the persisted itinerary + undo history). Most
 * of this is NOT saved server-side, but a slice of it (below) survives a
 * refresh via localStorage so a friend mid-walk doesn't lose their progress
 * to an accidental reload.
 */

// A no-op storage on the server (localStorage doesn't exist there) — combined
// with `skipHydration` below, this keeps SSR's first render deterministic and
// avoids a hydration mismatch. The real read happens in JourneyEngine's mount
// effect via `useJourneyStore.persist.rehydrate()`.
const safeStorage = {
  getItem: (name: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(name)),
  setItem: (name: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(name);
  },
};

// Thirst empties in exactly 1 hour, hunger in exactly 4 — real-world-paced
// rather than the earlier demo-session-paced rates, per-minute since the
// depletion tick now runs once a minute (see JourneyEngine, which also owns
// the walking-speed multiplier — this store just applies whatever it passes in).
const THIRST_DECAY_PER_MIN = 100 / 60;
const HUNGER_DECAY_PER_MIN = 100 / 240;

const FATIGUE_RECOVERY_PER_SEC = 100 / 90;
const WATER_BOOST = 30;
const MEAL_BOOST = 40;
/** ~1300 steps/km, scaled down so a full day of walking reads as meaningful
 *  fatigue without instantly maxing the bar out on the first stop. */
const FATIGUE_PER_METER = (1.3 / 1000) * 6;

const clampPercent = (v: number) => Math.max(0, Math.min(100, v));

export interface ArrivalInfo {
  stepId: string;
  stepName: string;
}

export interface UnlockedGemInfo {
  id: string;
  note: string;
}

export type PanelView = "overview" | "unplanned" | "day";

interface JourneyState {
  isEditMode: boolean;
  toggleEditMode: () => void;

  /** Which pill tab is showing in the panel, persisted so a refresh mid-trip
   *  doesn't dump the friend back to a random tab. When panelView is "day",
   *  `savedDayIndex` says which one — useTripStore.activeDayIndex is the
   *  live source of truth, this is just what gets restored on reload. */
  panelView: PanelView;
  savedDayIndex: number;
  setPanelView: (view: PanelView) => void;
  setSavedDayIndex: (index: number) => void;

  /** Whether the mobile bottom sheet is expanded to its near-full height —
   *  shared (rather than local component state) so the top HUD can fade
   *  itself out of the way while the sheet takes over the screen. */
  sheetExpanded: boolean;
  setSheetExpanded: (expanded: boolean) => void;

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
  tickRecovery: (seconds: number) => void;
  /** Runs once a minute from JourneyEngine — `multiplier` is
   *  WALK_DECAY_MULTIPLIER when the visitor has been walking that minute,
   *  1 otherwise (or when back-filling elapsed offline time). */
  tickMinuteDecay: (minutes: number, multiplier: number) => void;
  /** Timestamp (ms) hunger/thirst/fatigue were last touched — persisted so a
   *  reload can back-fill however much time passed while the app was closed. */
  lastUpdatedTimestamp: number | null;
  applyOfflineDecay: () => void;

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

  /** Istanbul-local ("YYYY-MM-DD") date the stats were last reset for. Checked
   *  on a timer in JourneyEngine — cat count is deliberately untouched. */
  lastResetDate: string | null;
  checkMidnightReset: () => void;

  /** Hidden gems the visitor has physically unlocked at least once — a
   *  geo-locked gem only shows its full reveal modal the first time. */
  discoveredGemIds: string[];
  unlockedGem: UnlockedGemInfo | null;
  triggerGemUnlock: (id: string, note: string) => void;
  clearGemUnlock: () => void;

  /** Brief "get closer" toast when a still-locked gem is tapped from afar. */
  gemHintVisible: boolean;
  showGemHint: () => void;
  clearGemHint: () => void;

  /** Applied when useSyncTelemetry picks up a Game Master override (see
   *  /api/sync/overrides/[playerId]) — reuses the same stat fields the
   *  player's own HUD taps write to, so a GM "heal" looks identical to the
   *  player doing it themselves, just remotely triggered. */
  applyGmOverride: (action: GmAction) => void;
  gmMessage: string | null;
  clearGmMessage: () => void;
}

export const CAT_MILESTONES = [1, 5, 10, 25, 50];

export const useJourneyStore = create<JourneyState>()(
  persist(
    (set, get) => ({
      isEditMode: false,
      toggleEditMode: () => set((s) => ({ isEditMode: !s.isEditMode })),

      panelView: "day",
      savedDayIndex: 0,
      setPanelView: (view) => set({ panelView: view }),
      setSavedDayIndex: (index) => set({ savedDayIndex: index }),

      sheetExpanded: false,
      setSheetExpanded: (expanded) => set({ sheetExpanded: expanded }),

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
      addFatigue: (amount) => set((s) => ({ fatigue: clampPercent(s.fatigue + amount) })),
      feed: (amount) =>
        set((s) => ({ hunger: clampPercent(s.hunger + amount), lastUpdatedTimestamp: Date.now() })),
      drinkWater: () =>
        set((s) => ({ thirst: clampPercent(s.thirst + WATER_BOOST), lastUpdatedTimestamp: Date.now() })),
      tickRecovery: (seconds) =>
        set((s) => ({ fatigue: Math.max(0, s.fatigue - FATIGUE_RECOVERY_PER_SEC * seconds) })),
      tickMinuteDecay: (minutes, multiplier) =>
        set((s) => ({
          hunger: clampPercent(s.hunger - HUNGER_DECAY_PER_MIN * minutes * multiplier),
          thirst: clampPercent(s.thirst - THIRST_DECAY_PER_MIN * minutes * multiplier),
          lastUpdatedTimestamp: Date.now(),
        })),
      lastUpdatedTimestamp: null,
      applyOfflineDecay: () => {
        const last = get().lastUpdatedTimestamp;
        if (last == null) {
          set({ lastUpdatedTimestamp: Date.now() });
          return;
        }
        const elapsedMinutes = (Date.now() - last) / 60000;
        if (elapsedMinutes <= 0) return;
        // Offline time is a flat rate — we have no location history for
        // while the app was closed, so no walking multiplier applies.
        get().tickMinuteDecay(elapsedMinutes, 1);
      },

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

      lastResetDate: null,
      checkMidnightReset: () => {
        const today = istanbulDateString();
        set((s) => {
          if (s.lastResetDate === today) return {};
          return {
            fatigue: 0,
            hunger: 100,
            thirst: 100,
            lastResetDate: today,
            // Reset "consumes" the elapsed time so applyOfflineDecay (which
            // runs right after this in JourneyEngine) doesn't immediately
            // re-deplete the freshly-reset stats for the same gap.
            lastUpdatedTimestamp: Date.now(),
          };
        });
      },

      discoveredGemIds: [],
      unlockedGem: null,
      triggerGemUnlock: (id, note) =>
        set((s) => {
          if (s.discoveredGemIds.includes(id)) return {};
          return { unlockedGem: { id, note }, discoveredGemIds: [...s.discoveredGemIds, id] };
        }),
      clearGemUnlock: () => set({ unlockedGem: null }),

      gemHintVisible: false,
      showGemHint: () => set({ gemHintVisible: true }),
      clearGemHint: () => set({ gemHintVisible: false }),

      gmMessage: null,
      applyGmOverride: (action) =>
        set((s) => {
          const message = GM_ACTION_MESSAGE[action];
          switch (action) {
            case "full_heal":
              return { hunger: 100, thirst: 100, fatigue: 0, lastUpdatedTimestamp: Date.now(), gmMessage: message };
            case "send_water":
              return { thirst: clampPercent(s.thirst + WATER_BOOST), lastUpdatedTimestamp: Date.now(), gmMessage: message };
            case "cure_fatigue":
              return { fatigue: 0, gmMessage: message };
            case "gift_cat": {
              const next = s.catsPetted + 1;
              return {
                catsPetted: next,
                lastCatMilestone: CAT_MILESTONES.includes(next) ? next : s.lastCatMilestone,
                gmMessage: message,
              };
            }
            default:
              return {};
          }
        }),
      clearGmMessage: () => set({ gmMessage: null }),
    }),
    {
      name: "touristguider-journey",
      storage: createJSONStorage(() => safeStorage),
      // We hydrate manually (see JourneyEngine's mount effect) so the very
      // first client render matches the server's — otherwise a friend who
      // already has progress saved would see a React hydration mismatch.
      skipHydration: true,
      // liveLocation/watchId/arrival/isEditMode/unlockedGem/gemHintVisible are
      // intentionally excluded — location and "just happened" reveals should
      // always start fresh on reload, and View Mode should always default on.
      partialize: (s) => ({
        dayStarted: s.dayStarted,
        fatigue: s.fatigue,
        hunger: s.hunger,
        thirst: s.thirst,
        restingStepId: s.restingStepId,
        catsPetted: s.catsPetted,
        celebratedStepIds: s.celebratedStepIds,
        panelView: s.panelView,
        savedDayIndex: s.savedDayIndex,
        lastResetDate: s.lastResetDate,
        lastUpdatedTimestamp: s.lastUpdatedTimestamp,
        discoveredGemIds: s.discoveredGemIds,
      }),
    }
  )
);

export { FATIGUE_PER_METER, MEAL_BOOST };
