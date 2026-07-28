"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import PlaceSearch from "./PlaceSearch";

export default function DayStartEditor({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const setDayStartTime = useTripStore((s) => s.setDayStartTime);
  const setDayStartPoint = useTripStore((s) => s.setDayStartPoint);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const [editingPoint, setEditingPoint] = useState(false);

  if (!day) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-stone-200/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">🏁</span>
        {editingPoint ? (
          <div className="flex-1">
            <PlaceSearch
              placeholder="Search meeting point…"
              onSelect={(p) => {
                setDayStartPoint(day.id, p);
                setEditingPoint(false);
              }}
            />
          </div>
        ) : isEditMode ? (
          <button
            type="button"
            className="flex-1 truncate text-left text-sm font-medium tracking-tight text-stone-700 hover:text-sage-700"
            onClick={() => setEditingPoint(true)}
          >
            {day.startPoint.name}
          </button>
        ) : (
          <span className="flex-1 truncate text-sm font-medium tracking-tight text-stone-700">
            {day.startPoint.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-6 text-sm text-stone-500">
        <span>Start time</span>
        {isEditMode ? (
          <input
            type="time"
            value={day.startTime}
            onChange={(e) => setDayStartTime(day.id, e.target.value)}
            className="rounded-lg border border-stone-200 px-2 py-1 text-stone-900"
          />
        ) : (
          <span className="font-medium text-stone-700">{day.startTime}</span>
        )}
      </div>
    </div>
  );
}
