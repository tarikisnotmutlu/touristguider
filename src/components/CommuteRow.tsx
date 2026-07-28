"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { TRANSPORT_ICON, TRANSPORT_LABEL, TRANSPORT_MODES } from "@/lib/transport";

/** Renders as 3 direct grid cells (time / line+icons / annotation) so it lines
 *  up with StepRow's own 3 cells inside Timeline's shared CSS grid. */
export default function CommuteRow({ dayId, segIndex }: { dayId: string; segIndex: number }) {
  const route = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.routes[segIndex]);
  const setSegmentMode = useTripStore((s) => s.setSegmentMode);
  const setTransitLine = useTripStore((s) => s.setTransitLine);
  const resetRouteToAuto = useTripStore((s) => s.resetRouteToAuto);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const [editingLine, setEditingLine] = useState(false);
  const [lineDraft, setLineDraft] = useState("");

  if (!route) return null;

  const km = route.distanceM != null ? (route.distanceM / 1000).toFixed(1) : "…";
  const min = route.durationMin != null ? Math.round(route.durationMin) : "…";

  function commitLine() {
    setTransitLine(dayId, segIndex, lineDraft);
    setEditingLine(false);
  }

  return (
    <>
      <div />
      <div className="flex justify-center">
        <div className="border-l-2 border-dashed border-stone-300/70" style={{ minHeight: 28 }} />
      </div>
      <div className="flex flex-col gap-1.5 py-1.5 text-xs text-stone-500">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {isEditMode ? (
            <div className="flex gap-0.5">
              {TRANSPORT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  title={TRANSPORT_LABEL[mode]}
                  onClick={() => setSegmentMode(dayId, segIndex, mode)}
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-sm leading-none transition",
                    mode === route!.mode
                      ? "bg-sage-100 ring-1 ring-sage-400"
                      : "opacity-40 hover:opacity-80"
                  )}
                >
                  {TRANSPORT_ICON[mode]}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm leading-none" title={TRANSPORT_LABEL[route.mode]}>
              {TRANSPORT_ICON[route.mode]}
            </span>
          )}
          <span className="font-medium text-stone-600">
            {km} km · {min} min
          </span>
          {isEditMode && route.isManual && (
            <span className="flex items-center gap-1 rounded-full bg-terracotta-100 px-2 py-0.5 text-terracotta-700">
              ✏️ edited
              <button type="button" className="underline" onClick={() => resetRouteToAuto(dayId, segIndex)}>
                reset
              </button>
            </span>
          )}
        </div>

        {route.mode === "transit" && (isEditMode || route.transitLine) && (
          <div>
            {!isEditMode ? (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                {route.transitLine}
              </span>
            ) : editingLine ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitLine();
                }}
              >
                <input
                  autoFocus
                  value={lineDraft}
                  onChange={(e) => setLineDraft(e.target.value)}
                  onBlur={commitLine}
                  onKeyDown={(e) => e.key === "Escape" && setEditingLine(false)}
                  placeholder="e.g. M2 Metro to Taksim"
                  className="w-44 rounded-full border border-stone-200 bg-white/80 px-2.5 py-1 text-xs text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLineDraft(route.transitLine ?? "");
                  setEditingLine(true);
                }}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-left transition",
                  route.transitLine
                    ? "bg-stone-100 font-medium text-stone-700 hover:bg-stone-200"
                    : "text-stone-400 underline decoration-dotted underline-offset-2 hover:text-stone-600"
                )}
              >
                {route.transitLine ?? "+ add the line (e.g. M2 Metro to Taksim)"}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
