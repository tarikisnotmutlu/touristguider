"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { TRANSPORT_ICON, TRANSPORT_LABEL, TRANSPORT_MODES } from "@/lib/transport";
import { pointBefore } from "@/lib/dayHelpers";
import { directionsUrl } from "@/lib/googleMaps";

/** Renders as 2 direct grid cells (line / pill+nav) so it lines up with
 *  StepRow's own 2 cells inside Timeline's shared CSS grid. */
export default function CommuteRow({ dayId, segIndex }: { dayId: string; segIndex: number }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const setSegmentMode = useTripStore((s) => s.setSegmentMode);
  const setTransitLine = useTripStore((s) => s.setTransitLine);
  const resetRouteToAuto = useTripStore((s) => s.resetRouteToAuto);
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const [editingLine, setEditingLine] = useState(false);
  const [lineDraft, setLineDraft] = useState("");

  const route = day?.routes[segIndex];
  if (!day || !route) return null;

  const km = route.distanceM != null ? (route.distanceM / 1000).toFixed(1) : "…";
  const min = route.durationMin != null ? Math.round(route.durationMin) : "…";

  function commitLine() {
    setTransitLine(dayId, segIndex, lineDraft);
    setEditingLine(false);
  }

  function handleNavigate() {
    if (!day || !route) return;
    const from = pointBefore(day, segIndex);
    const to = day.steps[segIndex];
    window.open(directionsUrl(from, to, route.mode), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="flex justify-center">
        <div className="border-l-2 border-dashed border-stone-300/70" style={{ minHeight: 28 }} />
      </div>
      <div className="flex flex-col gap-1.5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            <span>{TRANSPORT_ICON[route.mode]}</span>
            <span>
              {min}m • {km}km
            </span>
          </div>
          <button
            onClick={handleNavigate}
            type="button"
            title="Navigate"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition hover:bg-blue-600"
          >
            🧭
          </button>
        </div>

        {isEditMode && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-xs text-stone-500">
            <div className="flex gap-0.5">
              {TRANSPORT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  title={TRANSPORT_LABEL[mode]}
                  onClick={() => setSegmentMode(dayId, segIndex, mode)}
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-sm leading-none transition",
                    mode === route.mode ? "bg-sage-100 ring-1 ring-sage-400" : "opacity-40 hover:opacity-80"
                  )}
                >
                  {TRANSPORT_ICON[mode]}
                </button>
              ))}
            </div>
            {route.isManual && (
              <span className="flex items-center gap-1 rounded-full bg-terracotta-100 px-2 py-0.5 text-terracotta-700">
                ✏️ edited
                <button type="button" className="underline" onClick={() => resetRouteToAuto(dayId, segIndex)}>
                  reset
                </button>
              </span>
            )}
          </div>
        )}

        {route.mode === "transit" && (isEditMode || route.transitLine) && (
          <div className="pl-1">
            {!isEditMode ? (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
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
                  "rounded-full px-2.5 py-1 text-left text-xs transition",
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
