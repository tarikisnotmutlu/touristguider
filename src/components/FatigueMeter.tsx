"use client";

import { motion } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { completedWalkingMeters } from "@/lib/time";

/** Rough average stride: ~1,300 steps per kilometer walked. */
const STEPS_PER_METER = 1.3;
const MAX_STEPS_FOR_BAR = 15000;

const LEVELS = [
  { maxSteps: 2600, label: "Fresh legs, big dreams 🌱", color: "var(--color-sage-400)" },
  { maxSteps: 6500, label: "Warmed up and wandering 🚶", color: "var(--color-sage-600)" },
  { maxSteps: 10400, label: "Feeling those cobblestones 😅", color: "var(--color-terracotta-400)" },
  { maxSteps: 15600, label: "Blister o'clock 🩹", color: "var(--color-terracotta-600)" },
  { maxSteps: Infinity, label: "Send snacks and a taxi 🥵", color: "var(--color-terracotta-800)" },
];

export default function FatigueMeter({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  if (!day) return null;

  const meters = completedWalkingMeters(day);
  const steps = Math.round(meters * STEPS_PER_METER);
  const level = LEVELS.find((l) => steps <= l.maxSteps)!;
  const pct = Math.min(100, (steps / MAX_STEPS_FOR_BAR) * 100);

  return (
    <div className="glass-panel mx-3 mb-2 rounded-2xl px-3.5 py-2.5 text-xs shadow-sm">
      <div className="mb-1.5 flex items-center justify-between text-stone-500">
        <span className="font-medium tracking-tight">Tourist Fatigue Meter</span>
        <span className="font-semibold text-stone-700">{steps.toLocaleString()} steps</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200/70">
        <motion.div
          className="h-full rounded-full"
          style={{ background: level.color }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        />
      </div>
      <motion.p
        key={level.label}
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="mt-1.5 text-stone-500"
      >
        {level.label}
      </motion.p>
    </div>
  );
}
