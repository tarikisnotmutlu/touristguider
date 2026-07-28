"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
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
            <h3 className="text-lg font-bold text-slate-800">{found.step.name}</h3>
            <button
              onClick={() => setActiveStepId(null)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
              type="button"
            >
              ✕
            </button>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Must try / Things to do
            </h4>
            <ul className="flex flex-col gap-1.5">
              {found.step.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklistItem(found!.dayId, found!.step.id, item.id)}
                  />
                  <span className={item.done ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-700"}>
                    {item.label}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(found!.dayId, found!.step.id, item.id)}
                    className="text-slate-300 hover:text-red-500"
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {found.step.checklist.length === 0 && (
                <li className="text-sm text-slate-400">Nothing added yet.</li>
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
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
              />
              <button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
                Add
              </button>
            </form>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</h4>
            <textarea
              value={found.step.notes}
              onChange={(e) => updateStep(found!.dayId, found!.step.id, { notes: e.target.value })}
              rows={3}
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Anything to remember about this stop…"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
