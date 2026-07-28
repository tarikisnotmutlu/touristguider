"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import type { Step } from "@/lib/types";
import { CATEGORY_COLOR, CATEGORY_ICON } from "@/lib/categories";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

/** Renders as 3 direct grid cells (time / dot / card) so it lines up with
 *  CommuteRow's own 3 cells inside Timeline's shared CSS grid. */
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

  return (
    <>
      <div className="pt-2 text-right">
        <p className="text-xs font-semibold text-stone-700">{step.arrival}</p>
        <p className="text-[10px] text-stone-400">{step.departure}</p>
      </div>

      <div className="flex justify-center pt-1.5">
        <button
          onClick={() => toggleStepCompleted(dayId, step.id)}
          type="button"
          title={step.completed ? "Mark as not done" : "Mark as done"}
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-sm shadow"
          style={{ background: step.completed ? "var(--color-sage-500)" : CATEGORY_COLOR[step.category] }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {step.completed ? (
              <motion.span
                key="check"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={SPRING}
                className="text-white"
              >
                ✓
              </motion.span>
            ) : (
              <motion.span
                key="icon"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={SPRING}
              >
                {CATEGORY_ICON[step.category]}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-stone-800 text-[9px] font-bold text-white">
            {index + 1}
          </span>
        </button>
      </div>

      <motion.div
        ref={setNodeRef}
        style={dragStyle}
        animate={{ opacity: isDragging ? 0.5 : step.completed ? 0.6 : 1 }}
        transition={SPRING}
        className={clsx(
          "mb-2 flex items-start gap-2 rounded-2xl border p-2.5 shadow-sm transition-colors",
          step.id === activeStepId
            ? "border-sage-300 bg-sage-50"
            : "border-stone-200 bg-white/90"
        )}
      >
        {isEditMode && (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 shrink-0 cursor-grab touch-none text-stone-300 active:cursor-grabbing"
            aria-label="Drag to reorder"
            type="button"
          >
            ⠿
          </button>
        )}

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setActiveStepId(step.id)}>
          <p
            className={clsx(
              "truncate text-sm font-semibold tracking-tight text-stone-800 transition-all",
              step.completed && "text-stone-400 line-through decoration-stone-300"
            )}
          >
            {step.name}
          </p>
          <p className="text-xs text-stone-400">
            {step.arrival} → {step.departure}
            {step.checklist.length > 0 && (
              <span className="ml-2">
                ✅ {doneCount}/{step.checklist.length}
              </span>
            )}
          </p>
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
