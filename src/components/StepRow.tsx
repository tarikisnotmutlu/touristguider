"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import type { Step } from "@/lib/types";
import { CATEGORY_COLOR, CATEGORY_ICON } from "@/lib/categories";

export default function StepRow({ dayId, step, index }: { dayId: string; step: Step; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const removeStep = useTripStore((s) => s.removeStep);
  const updateStep = useTripStore((s) => s.updateStep);
  const setActiveStepId = useTripStore((s) => s.setActiveStepId);
  const activeStepId = useTripStore((s) => s.activeStepId);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const doneCount = step.checklist.filter((c) => c.done).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex items-start gap-2 rounded-xl border p-2.5 transition",
        step.id === activeStepId ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 shrink-0 cursor-grab touch-none text-slate-400 active:cursor-grabbing"
        aria-label="Drag to reorder"
        type="button"
      >
        ⠿
      </button>

      <button
        className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-sm shadow"
        style={{ background: CATEGORY_COLOR[step.category] }}
        onClick={() => setActiveStepId(step.id)}
        type="button"
        title={CATEGORY_ICON[step.category]}
      >
        {CATEGORY_ICON[step.category]}
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-900 text-[9px] font-bold text-white">
          {index + 1}
        </span>
      </button>

      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setActiveStepId(step.id)}>
        <p className="truncate text-sm font-semibold text-slate-800">{step.name}</p>
        <p className="text-xs text-slate-500">
          {step.arrival} → {step.departure}
          {step.checklist.length > 0 && (
            <span className="ml-2">
              ✅ {doneCount}/{step.checklist.length}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <label className="flex items-center gap-1 text-[11px] text-slate-400">
          <input
            type="number"
            min={5}
            step={5}
            value={step.durationMin}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              updateStep(dayId, step.id, { durationMin: Math.max(5, Number(e.target.value) || 5) })
            }
            className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right text-xs"
          />
          min
        </label>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeStep(dayId, step.id);
          }}
          className="text-[11px] text-slate-400 hover:text-red-500"
          type="button"
        >
          remove
        </button>
      </div>
    </div>
  );
}
