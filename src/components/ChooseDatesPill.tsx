"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { formatDateRange } from "@/lib/dateFormat";

export default function ChooseDatesPill() {
  const trip = useTripStore((s) => s.trip);
  const setTripDates = useTripStore((s) => s.setTripDates);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const [editing, setEditing] = useState(false);
  const [startDraft, setStartDraft] = useState(trip.startDate ?? "");
  const [endDraft, setEndDraft] = useState(trip.endDate ?? "");

  const label = formatDateRange(trip.startDate, trip.endDate);

  if (editing) {
    return (
      <form
        className="mt-1.5 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          setTripDates(startDraft, endDraft);
          setEditing(false);
        }}
      >
        <input
          type="date"
          value={startDraft}
          onChange={(e) => setStartDraft(e.target.value)}
          className="rounded-full border border-stone-200 px-2 py-1 text-[11px] text-stone-900"
        />
        <input
          type="date"
          value={endDraft}
          onChange={(e) => setEndDraft(e.target.value)}
          className="rounded-full border border-stone-200 px-2 py-1 text-[11px] text-stone-900"
        />
        <button type="submit" className="text-[11px] font-medium text-sage-700 underline">
          Save
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => isEditMode && setEditing(true)}
      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 disabled:cursor-default"
      disabled={!isEditMode}
    >
      📅 {label ?? "Choose dates"}
    </button>
  );
}
