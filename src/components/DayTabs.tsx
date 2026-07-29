"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={clsx(
        "relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium tracking-tight transition-colors",
        active ? "text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
      )}
    >
      {active && (
        <motion.div
          layoutId="panel-tab-active"
          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
          className="absolute inset-0 rounded-full bg-zinc-800 shadow-sm"
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

export default function DayTabs() {
  const days = useTripStore((s) => s.trip.days);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const setActiveDayIndex = useTripStore((s) => s.setActiveDayIndex);
  const addDay = useTripStore((s) => s.addDay);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const panelView = useJourneyStore((s) => s.panelView);
  const setPanelView = useJourneyStore((s) => s.setPanelView);
  const setSavedDayIndex = useJourneyStore((s) => s.setSavedDayIndex);

  function selectDay(i: number) {
    setActiveDayIndex(i);
    setPanelView("day");
    setSavedDayIndex(i);
  }

  function handleAddDay() {
    addDay();
    setPanelView("day");
    setSavedDayIndex(days.length);
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2.5">
      <TabPill active={panelView === "overview"} onClick={() => setPanelView("overview")}>
        Overview
      </TabPill>
      {days.map((day, i) => (
        <TabPill key={day.id} active={panelView === "day" && i === activeDayIndex} onClick={() => selectDay(i)}>
          {day.label}
        </TabPill>
      ))}
      {isEditMode && (
        <button
          onClick={handleAddDay}
          type="button"
          title="Add a day"
          className="shrink-0 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-400 transition-colors hover:border-sage-400 hover:text-sage-700"
        >
          + Add Day
        </button>
      )}
      <TabPill active={panelView === "unplanned"} onClick={() => setPanelView("unplanned")}>
        Unplanned
      </TabPill>
    </div>
  );
}
