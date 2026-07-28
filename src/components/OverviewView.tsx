"use client";

import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";

export default function OverviewView() {
  const days = useTripStore((s) => s.trip.days);
  const unplannedCount = useTripStore((s) => s.trip.unplanned.length);
  const setActiveDayIndex = useTripStore((s) => s.setActiveDayIndex);
  const setPanelView = useJourneyStore((s) => s.setPanelView);
  const setSavedDayIndex = useJourneyStore((s) => s.setSavedDayIndex);

  function jumpToDay(i: number) {
    setActiveDayIndex(i);
    setSavedDayIndex(i);
    setPanelView("day");
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-4">
      {days.map((day, i) => (
        <button
          key={day.id}
          onClick={() => jumpToDay(i)}
          type="button"
          className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white/85 p-4 text-left shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-xl transition-colors hover:bg-stone-50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-stone-800">{day.label}</p>
            <p className="text-xs text-stone-400">
              {day.steps.length} {day.steps.length === 1 ? "stop" : "stops"} · starts {day.startTime}
            </p>
          </div>
          <span className="shrink-0 text-stone-300">→</span>
        </button>
      ))}

      {unplannedCount > 0 && (
        <p className="pt-1 text-center text-xs text-stone-400">
          {unplannedCount} unplanned {unplannedCount === 1 ? "place" : "places"} waiting in the Unplanned tab
        </p>
      )}
    </div>
  );
}
