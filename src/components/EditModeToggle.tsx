"use client";

import { motion } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

/** Discreet global toggle between the clutter-free View mode (default, what a
 *  friend following the trip sees) and Edit mode (search, drag handles,
 *  delete, transport picker, hidden-gem creator). */
export default function EditModeToggle() {
  const isEditMode = useJourneyStore((s) => s.isEditMode);
  const toggleEditMode = useJourneyStore((s) => s.toggleEditMode);

  return (
    <button
      onClick={toggleEditMode}
      type="button"
      title={isEditMode ? "Exit edit mode" : "Enter edit mode"}
      className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-stone-500 hover:bg-stone-100"
    >
      <motion.span
        animate={{ rotate: isEditMode ? 45 : 0 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="text-sm leading-none"
      >
        {isEditMode ? "✕" : "✎"}
      </motion.span>
      {isEditMode ? "Done" : "Edit"}
    </button>
  );
}
