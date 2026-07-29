"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTripStore } from "@/store/useTripStore";
import { ALL_CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from "@/lib/categories";
import Modal from "./Modal";

export default function StepCard() {
  const trip = useTripStore((s) => s.trip);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const setActiveStepId = useTripStore((s) => s.setActiveStepId);
  const toggleChecklistItem = useTripStore((s) => s.toggleChecklistItem);
  const addChecklistItem = useTripStore((s) => s.addChecklistItem);
  const removeChecklistItem = useTripStore((s) => s.removeChecklistItem);
  const updateStep = useTripStore((s) => s.updateStep);
  const [newItem, setNewItem] = useState("");

  let found: { dayId: string; step: (typeof trip.days)[number]["steps"][number] } | null = null;
  for (const day of trip.days) {
    const step = day.steps.find((s) => s.id === activeStepId);
    if (step) {
      found = { dayId: day.id, step };
      break;
    }
  }

  return (
    <Modal open={!!found} onClose={() => setActiveStepId(null)}>
      {found && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-bold tracking-tight text-stone-800">{found.step.name}</h3>
            <button
              onClick={() => setActiveStepId(null)}
              className="shrink-0 text-stone-400 hover:text-stone-600"
              type="button"
            >
              ✕
            </button>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Category</h4>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  title={CATEGORY_LABEL[cat]}
                  onClick={() => updateStep(found!.dayId, found!.step.id, { category: cat })}
                  className={clsx(
                    "flex items-center gap-1 rounded-full border px-2 py-1 text-sm",
                    found.step.category === cat
                      ? "border-sage-400 bg-sage-50"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  <span>{CATEGORY_ICON[cat]}</span>
                  <span className="text-xs text-stone-600">{CATEGORY_LABEL[cat]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Must try / Things to do
            </h4>
            <ul className="flex flex-col gap-1.5">
              {found.step.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2.5 text-sm">
                  <button
                    onClick={() => toggleChecklistItem(found!.dayId, found!.step.id, item.id)}
                    type="button"
                    aria-label={item.done ? "Mark as not done" : "Mark as done"}
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      item.done ? "border-sage-600 bg-sage-600" : "border-stone-300 bg-white hover:border-sage-400"
                    )}
                  >
                    {item.done && (
                      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-white stroke-[2.5]">
                        <path d="M3 8.5L6.2 11.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={item.done ? "flex-1 text-stone-400 line-through" : "flex-1 text-stone-700"}>
                    {item.label}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(found!.dayId, found!.step.id, item.id)}
                    className="text-stone-300 hover:text-terracotta-600"
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {found.step.checklist.length === 0 && (
                <li className="text-sm text-stone-400">Nothing added yet.</li>
              )}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addChecklistItem(found!.dayId, found!.step.id, newItem);
                setNewItem("");
              }}
            >
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="e.g. Try the baklava"
                className="flex-1 rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-sage-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-sage-700"
              >
                Add
              </button>
            </form>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Notes</h4>
            <textarea
              value={found.step.notes}
              onChange={(e) => updateStep(found!.dayId, found!.step.id, { notes: e.target.value })}
              rows={3}
              className="w-full rounded-2xl border border-stone-200 p-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
              placeholder="Anything to remember about this stop…"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
