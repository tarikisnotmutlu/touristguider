"use client";

import { Fragment } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import CommuteRow from "./CommuteRow";
import StepRow from "./StepRow";
import PlaceSearch from "./PlaceSearch";
import AddCustomStopForm from "./AddCustomStopForm";
import AddHiddenGemForm from "./AddHiddenGemForm";

export default function Timeline({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  const reorderSteps = useTripStore((s) => s.reorderSteps);
  const addStep = useTripStore((s) => s.addStep);
  const addHiddenGem = useTripStore((s) => s.addHiddenGem);
  const isEditMode = useJourneyStore((s) => s.isEditMode);

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
    <div className="px-3 pb-4">
      {/* A shared 2-column grid (numbered node+line / card) so CommuteRow and
          StepRow — each emitting exactly 2 grid cells — line up automatically. */}
      <div className="grid grid-cols-[32px_1fr] gap-x-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={day.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {day.steps.map((step, i) => (
              <Fragment key={step.id}>
                <CommuteRow dayId={day.id} segIndex={i} />
                <StepRow dayId={day.id} step={step} index={i} />
              </Fragment>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {day.steps.length === 0 && (
        <p className="py-4 text-center text-sm text-stone-400">
          {isEditMode ? "No stops yet — search below to add the first one." : "No stops yet."}
        </p>
      )}

      {isEditMode && (
        <div className="mt-3">
          <PlaceSearch placeholder="Add a stop…" onSelect={(place) => addStep(day.id, place)} />
          <AddCustomStopForm onAdd={(name, lat, lng) => addStep(day.id, { name, lat, lng })} />
          <AddHiddenGemForm onAdd={(point, note, geoLocked, name) => addHiddenGem(point, note, geoLocked, name)} />
        </div>
      )}
    </div>
  );
}
