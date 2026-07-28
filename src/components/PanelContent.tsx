"use client";

import { useTripStore } from "@/store/useTripStore";
import DayTabs from "./DayTabs";
import DayStartEditor from "./DayStartEditor";
import Timeline from "./Timeline";
import FatigueMeter from "./FatigueMeter";
import ShareButton from "./ShareButton";

export default function PanelContent() {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const day = trip.days[activeDayIndex];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 pt-1 pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-slate-800">{trip.title}</h1>
          {trip.friendName && <p className="truncate text-xs text-slate-400">for {trip.friendName}</p>}
        </div>
        <ShareButton />
      </div>

      <div className="shrink-0">
        <DayTabs />
      </div>

      {day && (
        <>
          <div className="shrink-0">
            <DayStartEditor dayId={day.id} />
            <FatigueMeter dayId={day.id} />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <Timeline dayId={day.id} />
          </div>
        </>
      )}
    </div>
  );
}
