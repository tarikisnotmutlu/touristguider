"use client";

import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import type { Step } from "@/lib/types";
import { CATEGORY_TAG } from "@/lib/categories";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

const RING_SIZE = 26;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Apple-Fitness-style progress ring for a step's to-do checklist — an SVG
 *  track + a stroke-dasharray/dashoffset arc that fills clockwise from 12
 *  o'clock as items get checked off. Only rendered for the partial (0 <
 *  done < total) case; a fully-empty or fully-done checklist reuses the
 *  plain circular toggle's markup instead so those two states look and
 *  transition identically to the no-checklist fallback. */
function ProgressRing({ ratio }: { ratio: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  return (
    <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="#e7e5e4"
        strokeWidth={RING_STROKE}
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="var(--color-sage-600)"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
    </svg>
  );
}

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
          onClick={() => setActiveStepId(step.id)}
          type="button"
          title={step.name}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-100 text-sm font-bold text-stone-600 transition-colors"
        >
          {index + 1}
        </button>
      </div>

      <div ref={setNodeRef} style={dragStyle} className="mb-2 flex w-full max-w-full flex-row items-center gap-2">
      <motion.div
        animate={{ opacity: isDragging ? 0.5 : step.completed ? 0.3 : 1 }}
        transition={SPRING}
        className={clsx(
          // min-w-0 is the golden rule of flexbox truncation — without it this
          // flex item's default min-width:auto wins over its sibling toggle's
          // flex-none width, and (combined with the old `w-full` here fighting
          // the flex layout) forced the whole card past the viewport instead
          // of letting the title inside it actually truncate.
          "flex min-w-0 flex-1 flex-row items-center gap-3 rounded-[20px] border p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]",
          step.completed && "grayscale-[30%]",
          step.id === activeStepId ? "border-sage-300 bg-sage-50/95" : "border-white/60 bg-white/80"
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

        <div className="flex min-w-0 flex-1 flex-col gap-1" onClick={() => !isEditMode && setActiveStepId(step.id)}>
          <div className="flex min-w-0 flex-row items-center justify-between gap-2">
            {isEditMode ? (
              <input
                value={step.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateStep(dayId, step.id, { name: e.target.value })}
                className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent text-[17px] font-semibold tracking-tight text-stone-800 hover:border-stone-200 focus:border-sage-400 focus:outline-none"
              />
            ) : (
              <p
                className={clsx(
                  "min-w-0 flex-1 cursor-pointer truncate text-[17px] font-semibold tracking-tight text-stone-800 transition-all",
                  step.completed && "text-stone-400 line-through decoration-stone-300"
                )}
                onClick={() => setActiveStepId(step.id)}
              >
                {step.name}
              </p>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                {tag.text}
              </span>
              {step.arrival && <span className="text-xs font-medium text-stone-500">{step.arrival}</span>}
            </div>
          </div>
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
              title="Delete stop"
              className="text-sm text-stone-300 hover:text-terracotta-600"
              type="button"
            >
              🗑️
            </button>
          </div>
        )}

      </motion.div>

      {/* Outside the motion.div above on purpose — CSS opacity/grayscale on a
          parent bleeds into its children, and the whole point of dimming a
          completed card is to still read its done-ness at a glance, so the
          toggle needs to sit as a true sibling to escape that fade. */}
      {step.checklist.length > 0 && doneCount < step.checklist.length ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveStepId(step.id);
          }}
          type="button"
          title={`${doneCount}/${step.checklist.length} done — tap to open the checklist`}
          className="relative flex flex-none shrink-0 cursor-pointer items-center justify-center"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <ProgressRing ratio={doneCount / step.checklist.length} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-stone-600">
            {doneCount}/{step.checklist.length}
          </span>
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStepCompleted(dayId, step.id);
          }}
          type="button"
          title={step.completed ? "Mark as not done" : "Mark as done"}
          className={clsx(
            "flex flex-none shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
            step.completed ? "border-sage-600 bg-sage-600" : "border-stone-300 bg-white hover:border-sage-400"
          )}
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          {step.completed && (
            <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
              <path d="M3 8.5L6.2 11.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}
      </div>
    </>
  );
}
