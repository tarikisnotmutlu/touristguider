"use client";

import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { CATEGORY_TAG } from "@/lib/categories";
import PlaceSearch from "./PlaceSearch";

export default function UnplannedView() {
  const unplanned = useTripStore((s) => s.trip.unplanned);
  const days = useTripStore((s) => s.trip.days);
  const addUnplannedPlace = useTripStore((s) => s.addUnplannedPlace);
  const removeUnplannedPlace = useTripStore((s) => s.removeUnplannedPlace);
  const moveUnplannedToDay = useTripStore((s) => s.moveUnplannedToDay);
  const isEditMode = useJourneyStore((s) => s.isEditMode);

  return (
    <div className="flex flex-col gap-2 px-3 pb-4">
      {unplanned.length === 0 && (
        <p className="py-4 text-center text-sm text-stone-400">
          {isEditMode ? "No unplanned stops — search below to add one." : "No unplanned stops."}
        </p>
      )}

      {unplanned.map((place) => {
        const tag = CATEGORY_TAG[place.category];
        return (
          <div
            key={place.id}
            className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-tight text-stone-900">{place.name}</p>
              <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                {tag.text}
              </span>
            </div>
            {isEditMode && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) moveUnplannedToDay(place.id, e.target.value);
                  }}
                  className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-600"
                >
                  <option value="" disabled>
                    Add to day…
                  </option>
                  {days.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeUnplannedPlace(place.id)}
                  type="button"
                  className="text-[11px] text-stone-400 hover:text-terracotta-600"
                >
                  remove
                </button>
              </div>
            )}
          </div>
        );
      })}

      {isEditMode && (
        <div className="mt-2">
          <PlaceSearch placeholder="Add an unplanned place…" onSelect={(place) => addUnplannedPlace(place)} />
        </div>
      )}
    </div>
  );
}
