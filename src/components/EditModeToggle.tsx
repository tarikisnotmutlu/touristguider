"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";
import { useTripStore } from "@/store/useTripStore";
import { beginEditSession, saveEditsToFirestore } from "@/lib/tripSync";

/** Discreet global toggle between the clutter-free View mode (default, what a
 *  friend following the trip sees) and Edit mode (search, drag handles,
 *  delete, transport picker). Entering Edit Mode snapshots the trip so the
 *  deferred-OSRM save flow can diff against it later; leaving it (this is
 *  the "Done"/Save moment) runs that flow — fetching real routes only for
 *  edges an edit actually touched — before flipping the UI back to View. */
export default function EditModeToggle() {
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const toggleEditMode = useJourneyStore((s) => s.toggleEditMode);
  const applyResolvedTrip = useTripStore((s) => s.applyResolvedTrip);
  const setSaveState = useTripStore((s) => s.setSaveState);
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    if (saving) return;
    if (!isEditMode) {
      beginEditSession(useTripStore.getState().trip);
      toggleEditMode();
      return;
    }

    setSaving(true);
    setSaveState("saving");
    try {
      const sessionId = useTripStore.getState().trip.id;
      const resolved = await saveEditsToFirestore(sessionId, useTripStore.getState().trip);
      applyResolvedTrip(resolved);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } finally {
      setSaving(false);
      toggleEditMode();
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      type="button"
      title={isEditMode ? "Save and exit edit mode" : "Enter edit mode"}
      className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-60"
    >
      <motion.span
        animate={{ rotate: isEditMode ? 45 : 0 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="text-sm leading-none"
      >
        {isEditMode ? "✕" : "✎"}
      </motion.span>
      {saving ? "Saving…" : isEditMode ? "Done" : "Edit"}
    </button>
  );
}
