"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

/** Persists for as long as isAddingNode is true (not a timed auto-dismiss
 *  like GemHintToast) — the user needs the reminder available the whole
 *  time they're hunting for where to tap, not just a flash at the start. */
export default function AddNodeHintToast() {
  const visible = useJourneyStore((s) => s.isAddingNode);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="glass-panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 shadow-xl"
          >
            <span className="text-sm font-medium tracking-tight text-stone-700">
              📍 Click anywhere on the map to place a new stop
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
