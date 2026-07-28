"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

const PARTICLES = "🎉✨🎊⭐️🥳";
const CELEBRATION_MS = 5000;

interface Particle {
  id: number;
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  drift: number;
}

export default function ArrivalCelebration() {
  const arrival = useJourneyStore((s) => s.arrival);
  const clearArrival = useJourneyStore((s) => s.clearArrival);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => clearArrival(), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [arrival, clearArrival]);

  useEffect(() => {
    if (!arrival) return;
    // Randomness belongs in an effect, not render — deferred through a
    // microtask so the setState happens in a callback rather than
    // synchronously in the effect body.
    Promise.resolve().then(() => {
      setParticles(
        Array.from({ length: 14 }, (_, i) => ({
          id: i,
          emoji: PARTICLES[i % PARTICLES.length],
          left: 5 + Math.random() * 90,
          delay: Math.random() * 0.8,
          duration: 1.6 + Math.random() * 1.2,
          drift: (Math.random() - 0.5) * 80,
        }))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival?.stepId]);

  return (
    <AnimatePresence>
      {arrival && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={clearArrival}
          className="fixed inset-0 z-[2000] flex items-center justify-center overflow-hidden bg-stone-900/40 backdrop-blur-md"
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="pointer-events-none absolute bottom-0 text-2xl"
              style={{ left: `${p.left}%` }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: "-100vh", opacity: [0, 1, 1, 0], x: p.drift }}
              transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
            >
              {p.emoji}
            </motion.span>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.6 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel mx-4 flex flex-col items-center gap-2 rounded-3xl px-8 py-10 text-center shadow-2xl"
          >
            <motion.span
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              className="text-5xl"
            >
              🎉
            </motion.span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-stone-800">Arrived!</h2>
            <p className="text-sm text-stone-500">{arrival.stepName}</p>
            <p className="mt-1 text-xs text-stone-400">Take your time — you&apos;re resting now 🌿</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
