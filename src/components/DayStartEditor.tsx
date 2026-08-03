"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { parseLatLngPaste } from "@/lib/geo";
import PlaceSearch from "./PlaceSearch";

export default function DayStartEditor({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const setDayLabel = useTripStore((s) => s.setDayLabel);
  const setDayStartTime = useTripStore((s) => s.setDayStartTime);
  const setDayStartPoint = useTripStore((s) => s.setDayStartPoint);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const movingStartPointDayId = useJourneyStore((s) => s.movingStartPointDayId);
  const setMovingStartPointDayId = useJourneyStore((s) => s.setMovingStartPointDayId);
  const [editingPoint, setEditingPoint] = useState(false);
  const [coordsInput, setCoordsInput] = useState("");
  const isMoving = movingStartPointDayId === dayId;

  if (!day) return null;

  const parsedCoords = parseLatLngPaste(coordsInput);

  function handleCoordsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!day || !parsedCoords) return;
    setDayStartPoint(day.id, { name: day.startPoint.name, ...parsedCoords });
    setCoordsInput("");
    setEditingPoint(false);
  }

  return (
    <div className="flex flex-col gap-2 border-b border-stone-200/70 px-3 py-2.5">
      {isEditMode && (
        <input
          value={day.label}
          onChange={(e) => setDayLabel(day.id, e.target.value)}
          placeholder="Day name"
          className="w-full rounded border border-transparent bg-transparent text-base font-bold tracking-tight text-stone-800 hover:border-stone-200 focus:border-sage-400 focus:outline-none"
        />
      )}
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">🕛</span>
        {editingPoint ? (
          <div className="flex-1">
            <PlaceSearch
              placeholder="Search meeting point…"
              onSelect={(p) => {
                setDayStartPoint(day.id, p);
                setEditingPoint(false);
              }}
            />
            <form onSubmit={handleCoordsSubmit} className="mt-1.5 flex gap-1.5">
              <input
                value={coordsInput}
                onChange={(e) => setCoordsInput(e.target.value)}
                placeholder="Or paste Lat, Lng — e.g. 41.014568, 28.974133"
                className="w-full rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!parsedCoords}
                className="shrink-0 rounded-full bg-sage-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Set
              </button>
            </form>
            <button
              type="button"
              onClick={() => setEditingPoint(false)}
              className="mt-1 text-[11px] font-medium text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        ) : isEditMode ? (
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm font-medium tracking-tight text-stone-700 hover:text-sage-700"
              onClick={() => setEditingPoint(true)}
            >
              {day.startPoint.name}
            </button>
            <button
              type="button"
              onClick={() => setMovingStartPointDayId(isMoving ? null : day.id)}
              title={isMoving ? "Cancel — click the map to place it" : "Adjust pin location"}
              className={
                "shrink-0 text-sm transition-colors " +
                (isMoving ? "text-sage-600" : "text-stone-300 hover:text-sage-600")
              }
            >
              📍
            </button>
          </>
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
