"use client";

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

export default function PanelContent() {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const saveState = useTripStore((s) => s.saveState);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const panelView = useJourneyStore((s) => s.panelView);
  const day = trip.days[activeDayIndex];

  const spotCount = trip.days.reduce((sum, d) => sum + d.steps.length, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-1">
        <p className="truncate text-[11px] text-stone-400">
          {isEditMode ? SAVE_LABEL[saveState] : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <EditModeToggle />
          {isEditMode && <UndoRedoButtons />}
          <TripMenu />
          <ShareButton />
        </div>
      </div>

      {/* Destination card: title + subtitle, Wanderlog-style. */}
      <div className="flex shrink-0 flex-col gap-0.5 border-b border-stone-200/70 px-3 pb-3 pt-2">
        <h1 className="truncate text-base font-bold tracking-tight text-stone-800">{trip.title}</h1>
        <p className="text-xs text-stone-400">
          {trip.days.length} {trip.days.length === 1 ? "day" : "days"} • {spotCount}{" "}
          {spotCount === 1 ? "spot" : "spots"}
        </p>
      </div>

      <div className="shrink-0">
        <DayTabs />
      </div>

      {panelView === "overview" && (
        <div className="flex-1 overflow-y-auto overscroll-contain pt-2">
          <OverviewView />
        </div>
      )}

      {panelView === "unplanned" && (
        <div className="flex-1 overflow-y-auto overscroll-contain pt-2">
          <UnplannedView />
        </div>
      )}

      {panelView === "day" && day && (
        <>
          <div className="shrink-0">
            <DayStartEditor dayId={day.id} />
            <StartDayButton />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <Timeline dayId={day.id} />
          </div>
        </>
      )}
    </div>
  );
}
