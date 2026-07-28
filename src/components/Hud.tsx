"use client";

import { motion } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";
import { vibrate } from "@/lib/haptics";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

/** Green when the value is in a good place, amber in the middle, terracotta
 *  when it needs attention. `invert` flips which end is "good" — fatigue is
 *  bad when high, hunger/thirst are bad when low. */
function barColor(value: number, invert: boolean) {
  const v = invert ? 100 - value : value;
  if (v > 60) return "var(--color-sage-500)";
  if (v > 30) return "#d97706";
  return "var(--color-terracotta-600)";
}

/** 4-stage fatigue mood, from fresh to exhausted. */
function fatigueEmoji(value: number) {
  if (value <= 25) return "😊";
  if (value <= 60) return "😮‍💨";
  if (value <= 85) return "😅";
  return "😵";
}

function Bar({ emoji, label, value, invert }: { emoji: string; label: string; value: number; invert: boolean }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="text-sm leading-none">{emoji}</span>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-200/70 sm:w-14">
        <motion.div
          className="h-full rounded-full"
          style={{ background: barColor(value, invert) }}
          animate={{ width: `${Math.max(2, value)}%` }}
          transition={SPRING}
        />
      </div>
    </div>
  );
}

/** Floating glassmorphism status HUD, RPG-style — no numbers, just vibes. */
export default function Hud() {
  const fatigue = useJourneyStore((s) => s.fatigue);
  const hunger = useJourneyStore((s) => s.hunger);
  const thirst = useJourneyStore((s) => s.thirst);
  const drinkWater = useJourneyStore((s) => s.drinkWater);
  const catsPetted = useJourneyStore((s) => s.catsPetted);
  const petCat = useJourneyStore((s) => s.petCat);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-4 lg:left-[400px] lg:justify-center">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="glass-panel pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 shadow-lg"
      >
        <Bar emoji={fatigueEmoji(fatigue)} label="Fatigue" value={fatigue} invert />
        <Bar emoji="🍽️" label="Hunger" value={hunger} invert={false} />
        <Bar emoji="💧" label="Thirst" value={thirst} invert={false} />

        <div className="h-4 w-px bg-stone-300/70" />

        <motion.button
          onClick={() => {
            drinkWater();
            vibrate(50);
          }}
          whileTap={{ scale: 0.85 }}
          transition={SPRING}
          type="button"
          title="Drink water"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sm hover:bg-sky-200"
        >
          💧
        </motion.button>

        <motion.button
          onClick={() => {
            petCat();
            vibrate(30);
          }}
          whileTap={{ scale: 0.85 }}
          transition={SPRING}
          type="button"
          title="Pet a cat"
          className="relative flex h-7 w-7 items-center justify-center rounded-full bg-terracotta-100 text-sm hover:bg-terracotta-200"
        >
          🐾
          {catsPetted > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-white bg-stone-800 px-0.5 text-[8px] font-bold text-white">
              {catsPetted}
            </span>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
}
