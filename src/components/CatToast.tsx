"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

const MESSAGES: Record<number, string> = {
  1: "First cat petted! Istanbul has ~130,000 more.",
  5: "5 cats petted — you're basically a local now.",
  10: "10 cats! Somewhere, a sultan's ghost nods approvingly.",
  25: "25 cats petted. This is your true itinerary.",
  50: "50 cats?! Legend of the Bosphorus status: unlocked.",
};

export default function CatToast() {
  const milestone = useJourneyStore((s) => s.lastCatMilestone);
  const clearCatMilestone = useJourneyStore((s) => s.clearCatMilestone);

  useEffect(() => {
    if (milestone == null) return;
    const timer = setTimeout(() => clearCatMilestone(), 3000);
    return () => clearTimeout(timer);
  }, [milestone, clearCatMilestone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {milestone != null && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="glass-panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 shadow-xl"
          >
            <span className="text-lg">🐈</span>
            <span className="text-sm font-medium tracking-tight text-stone-700">
              {MESSAGES[milestone]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
