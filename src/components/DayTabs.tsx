"use client";

import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";

export default function DayTabs() {
  const days = useTripStore((s) => s.trip.days);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const setActiveDayIndex = useTripStore((s) => s.setActiveDayIndex);

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
      {days.map((day, i) => (
        <button
          key={day.id}
          onClick={() => setActiveDayIndex(i)}
          className={clsx(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
            i === activeDayIndex
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}
