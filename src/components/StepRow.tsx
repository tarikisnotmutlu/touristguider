"use client";

import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import type { Step } from "@/lib/types";
import { CATEGORY_TAG } from "@/lib/categories";
import { thumbnailUrl } from "@/lib/thumbnail";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

/** Renders as 2 direct grid cells (numbered node / card) so it lines up with
 *  CommuteRow's own 2 cells inside Timeline's shared CSS grid. */
export default function StepRow({ dayId, step, index }: { dayId: string; step: Step; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const removeStep = useTripStore((s) => s.removeStep);
  const updateStep = useTripStore((s) => s.updateStep);
  const toggleStepCompleted = useTripStore((s) => s.toggleStepCompleted);
  const setActiveStepId = useTripStore((s) => s.setActiveStepId);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const isEditMode = useJourneyStore((s) => s.isEditMode);

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const doneCount = step.checklist.filter((c) => c.done).length;
  const tag = CATEGORY_TAG[step.category];

  return (
    <>
      <div className="flex justify-center pt-1.5">
        <button
          onClick={() => toggleStepCompleted(dayId, step.id)}
          type="button"
          title={step.completed ? "Mark as not done" : "Mark as done"}
          className={clsx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors",
            step.completed
              ? "border-white bg-sage-500 text-white shadow-[0_0_10px_rgba(111,138,97,0.45)]"
              : "border-stone-300 bg-stone-100 text-stone-600"
          )}
        >
          {step.completed ? "✓" : index + 1}
        </button>
      </div>

      <motion.div
        ref={setNodeRef}
        style={dragStyle}
        animate={{ opacity: isDragging ? 0.5 : step.completed ? 0.6 : 1 }}
        transition={SPRING}
        className={clsx(
          "mb-2 flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm transition-colors",
          step.id === activeStepId ? "border-sage-300 bg-sage-50" : "border-stone-200"
        )}
      >
        {isEditMode && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-none text-stone-300 active:cursor-grabbing"
            aria-label="Drag to reorder"
            type="button"
          >
            ⠿
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(step.id, 128)}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setActiveStepId(step.id)}>
          <p
            className={clsx(
              "truncate text-sm font-bold tracking-tight text-stone-800 transition-all",
              step.completed && "text-stone-400 line-through decoration-stone-300"
            )}
          >
            {step.name}
          </p>
          <span
            className={clsx(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
              tag.className
            )}
          >
            {tag.text}
          </span>
          {step.checklist.length > 0 && (
            <p className="mt-1 text-[11px] text-stone-400">
              ✅ {doneCount}/{step.checklist.length}
            </p>
          )}
        </div>

        {isEditMode && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <label className="flex items-center gap-1 text-[11px] text-stone-400">
              <input
                type="number"
                min={5}
                step={5}
                value={step.durationMin}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  updateStep(dayId, step.id, { durationMin: Math.max(5, Number(e.target.value) || 5) })
                }
                className="w-12 rounded border border-stone-200 px-1 py-0.5 text-right text-xs text-stone-900"
              />
              min
            </label>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeStep(dayId, step.id);
              }}
              className="text-[11px] text-stone-400 hover:text-terracotta-600"
              type="button"
            >
              remove
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
