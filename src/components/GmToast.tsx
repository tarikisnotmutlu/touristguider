"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

/** Surfaces a message the moment useSyncTelemetry applies a Admin
 *  override (heal, water, cat, cure fatigue, or a free-form message) picked
 *  up from the player's own overrides subscription. Display time scales
 *  with length so a longer, free-typed GM message has time to actually be
 *  read, not just the fixed actions' short fixed strings. */
export default function GmToast() {
  const message = useJourneyStore((s) => s.gmMessage);
  const clearGmMessage = useJourneyStore((s) => s.clearGmMessage);

  useEffect(() => {
    if (!message) return;
    const durationMs = Math.min(9000, Math.max(3500, message.length * 90));
    const timer = setTimeout(() => clearGmMessage(), durationMs);
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
            className="glass-panel pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl px-4 py-2.5 shadow-xl"
          >
            <span className="text-lg leading-none">🎩</span>
            <span className="text-sm font-medium leading-snug tracking-tight text-stone-700">{message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
