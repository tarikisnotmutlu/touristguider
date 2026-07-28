"use client";

import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { TRANSPORT_ICON, TRANSPORT_LABEL, TRANSPORT_MODES } from "@/lib/transport";

export default function CommuteRow({ dayId, segIndex }: { dayId: string; segIndex: number }) {
  const route = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.routes[segIndex]);
  const setSegmentMode = useTripStore((s) => s.setSegmentMode);
  const resetRouteToAuto = useTripStore((s) => s.resetRouteToAuto);

  if (!route) return null;

  const km = route.distanceM != null ? (route.distanceM / 1000).toFixed(1) : "…";
  const min = route.durationMin != null ? Math.round(route.durationMin) : "…";

  return (
    <div className="ml-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-dashed border-slate-300 py-1.5 pl-4 text-xs text-slate-500">
      <div className="flex gap-0.5">
        {TRANSPORT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            title={TRANSPORT_LABEL[mode]}
            onClick={() => setSegmentMode(dayId, segIndex, mode)}
            className={clsx(
              "rounded-full px-1.5 py-0.5 text-sm leading-none transition",
              mode === route.mode ? "bg-indigo-100 ring-1 ring-indigo-400" : "opacity-40 hover:opacity-80"
            )}
          >
            {TRANSPORT_ICON[mode]}
          </button>
        ))}
      </div>
      <span className="font-medium text-slate-600">
        {km} km · {min} min
      </span>
      {route.isManual && (
        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
          ✏️ edited
          <button type="button" className="underline" onClick={() => resetRouteToAuto(dayId, segIndex)}>
            reset
          </button>
        </span>
      )}
    </div>
  );
}
