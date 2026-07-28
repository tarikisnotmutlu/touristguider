"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import PlaceSearch from "./PlaceSearch";

export default function DayStartEditor({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const setDayStartTime = useTripStore((s) => s.setDayStartTime);
  const setDayStartPoint = useTripStore((s) => s.setDayStartPoint);
  const [editingPoint, setEditingPoint] = useState(false);

  if (!day) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5">
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
        ) : (
          <button
            className="flex-1 truncate text-left text-sm font-medium text-slate-700 hover:underline"
            onClick={() => setEditingPoint(true)}
          >
            {day.startPoint.name}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-6 text-sm text-slate-500">
        <span>Start time</span>
        <input
          type="time"
          value={day.startTime}
          onChange={(e) => setDayStartTime(day.id, e.target.value)}
          className="rounded border border-slate-200 px-2 py-1"
        />
      </div>
    </div>
  );
}
