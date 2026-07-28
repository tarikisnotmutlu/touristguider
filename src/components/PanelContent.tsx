"use client";

import { useTripStore } from "@/store/useTripStore";
import DayTabs from "./DayTabs";
import DayStartEditor from "./DayStartEditor";
import Timeline from "./Timeline";
import StartDayButton from "./StartDayButton";
import ShareButton from "./ShareButton";
import UndoRedoButtons from "./UndoRedoButtons";
import TripMenu from "./TripMenu";
import EditModeToggle from "./EditModeToggle";

const SAVE_LABEL = {
  idle: "",
  saving: "Saving…",
  saved: "Saved ✓",
} as const;

export default function PanelContent() {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const saveState = useTripStore((s) => s.saveState);
  const day = trip.days[activeDayIndex];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/70 px-3 pt-1 pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold tracking-tight text-stone-800">{trip.title}</h1>
          <p className="truncate text-[11px] text-stone-400">
            {trip.friendName ? `for ${trip.friendName} · ` : ""}
            {SAVE_LABEL[saveState]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EditModeToggle />
          <UndoRedoButtons />
          <TripMenu />
          <ShareButton />
        </div>
      </div>

      <div className="shrink-0">
        <DayTabs />
      </div>

      {day && (
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
