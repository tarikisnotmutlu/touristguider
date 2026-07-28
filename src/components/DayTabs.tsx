"use client";

import { motion } from "framer-motion";
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
            "relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium tracking-tight transition-colors",
            i === activeDayIndex
              ? "text-white"
              : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
          )}
        >
          {i === activeDayIndex && (
            <motion.div
              layoutId="day-tab-active"
              transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              className="absolute inset-0 rounded-full bg-sage-600 shadow-sm"
            />
          )}
          <span className="relative">{day.label}</span>
        </button>
      ))}
    </div>
  );
}
