"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

/** Surfaces a message the moment useSyncTelemetry applies a Game Master
 *  override (heal, water, cat, cure fatigue) picked up from polling. */
export default function GmToast() {
  const message = useJourneyStore((s) => s.gmMessage);
  const clearGmMessage = useJourneyStore((s) => s.clearGmMessage);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => clearGmMessage(), 3500);
    return () => clearTimeout(timer);
  }, [message, clearGmMessage]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="glass-panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 shadow-xl"
          >
            <span className="text-lg">🎩</span>
            <span className="text-sm font-medium tracking-tight text-stone-700">{message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
