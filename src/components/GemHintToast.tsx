"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

export default function GemHintToast() {
  const visible = useJourneyStore((s) => s.gemHintVisible);
  const clearGemHint = useJourneyStore((s) => s.clearGemHint);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => clearGemHint(), 2500);
    return () => clearTimeout(timer);
  }, [visible, clearGemHint]);

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
              Get closer to unlock! 🔒
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
