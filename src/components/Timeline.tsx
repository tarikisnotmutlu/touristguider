"use client";

import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTripStore } from "@/store/useTripStore";
import CommuteRow from "./CommuteRow";
import StepRow from "./StepRow";
import PlaceSearch from "./PlaceSearch";

export default function Timeline({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const reorderSteps = useTripStore((s) => s.reorderSteps);
  const addStep = useTripStore((s) => s.addStep);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  if (!day) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !day) return;
    const fromIndex = day.steps.findIndex((s) => s.id === active.id);
    const toIndex = day.steps.findIndex((s) => s.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    reorderSteps(day.id, fromIndex, toIndex);
  }

  return (
    <div className="flex flex-col gap-0.5 px-3 pb-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={day.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {day.steps.map((step, i) => (
            <div key={step.id}>
              <CommuteRow dayId={day.id} segIndex={i} />
              <StepRow dayId={day.id} step={step} index={i} />
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {day.steps.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-400">
          No stops yet — search below to add the first one.
        </p>
      )}

      <div className="mt-3">
        <PlaceSearch
          placeholder="Add a stop…"
          onSelect={(place) => addStep(day.id, place)}
        />
      </div>
    </div>
  );
}
