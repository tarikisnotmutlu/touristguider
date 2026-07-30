"use client";

import { motion } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import DayTabs from "./DayTabs";
import DayStartEditor from "./DayStartEditor";
import Timeline from "./Timeline";
import StartDayButton from "./StartDayButton";
import ShareButton from "./ShareButton";
import UndoRedoButtons from "./UndoRedoButtons";
import TripMenu from "./TripMenu";
import EditModeToggle from "./EditModeToggle";
import OverviewView from "./OverviewView";
import UnplannedView from "./UnplannedView";

const SAVE_LABEL = {
  idle: "",
  saving: "Saving…",
  saved: "Saved ✓",
} as const;

export default function PanelContent({ respectSheetCollapse = false }: { respectSheetCollapse?: boolean }) {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const saveState = useTripStore((s) => s.saveState);
  const setTripTitle = useTripStore((s) => s.setTripTitle);
  const removeDay = useTripStore((s) => s.removeDay);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const panelView = useJourneyStore((s) => s.panelView);
  const setSavedDayIndex = useJourneyStore((s) => s.setSavedDayIndex);
  const sheetExpanded = useJourneyStore((s) => s.sheetExpanded);
  const day = trip.days[activeDayIndex];
  // DesktopPanel has no collapse state at all, so its own PanelContent
  // instance never passes respectSheetCollapse — only MobileSheet's copy
  // ties these buttons to isExpanded.
  const showActions = !respectSheetCollapse || sheetExpanded;

  const spotCount = trip.days.reduce((sum, d) => sum + d.steps.length, 0);

  function handleDeleteDay() {
    if (!day || trip.days.length <= 1) return;
    removeDay(day.id);
    setSavedDayIndex(useTripStore.getState().activeDayIndex);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <motion.div
        animate={{ opacity: showActions ? 1 : 0, y: showActions ? 0 : 10 }}
        transition={{ duration: 0.2 }}
        className={`flex shrink-0 items-center justify-between gap-2 px-3 pt-1 ${
          showActions ? "" : "pointer-events-none"
        }`}
      >
        <p className="truncate text-[11px] text-stone-400">
          {isEditMode ? SAVE_LABEL[saveState] : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <EditModeToggle />
          {isEditMode && <UndoRedoButtons />}
          <TripMenu />
          <ShareButton />
        </div>
      </motion.div>

      {/* Destination card: title + subtitle, Wanderlog-style. */}
      <div className="flex shrink-0 flex-col gap-0.5 border-b border-stone-200/70 px-3 pb-3 pt-2">
        {isEditMode ? (
          <input
            value={trip.title}
            onChange={(e) => setTripTitle(e.target.value)}
            className="truncate rounded-lg border border-transparent bg-transparent text-base font-bold tracking-tight text-stone-800 hover:border-stone-200 focus:border-sage-400 focus:outline-none"
          />
        ) : (
          <h1 className="truncate text-base font-bold tracking-tight text-stone-800">{trip.title}</h1>
        )}
        <p className="text-xs text-stone-400">
          {trip.days.length} {trip.days.length === 1 ? "day" : "days"} • {spotCount}{" "}
          {spotCount === 1 ? "spot" : "spots"}
        </p>
      </div>

      <div className="shrink-0">
        <DayTabs />
      </div>

      {panelView === "overview" && (
        <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-2">
          <OverviewView />
        </div>
      )}

      {panelView === "unplanned" && (
        <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-2">
          <UnplannedView />
        </div>
      )}

      {panelView === "day" && day && (
        <>
          <div className="shrink-0">
            <DayStartEditor dayId={day.id} />
            {isEditMode && trip.days.length > 1 && (
              <div className="flex justify-end px-3 pb-1">
                <button
                  onClick={handleDeleteDay}
                  type="button"
                  className="text-[11px] font-medium text-stone-400 hover:text-terracotta-600"
                >
                  🗑️ Delete Day
                </button>
              </div>
            )}
            <StartDayButton />
          </div>
          <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <Timeline dayId={day.id} />
          </div>
        </>
      )}
    </div>
  );
}
