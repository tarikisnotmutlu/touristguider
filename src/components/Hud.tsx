"use client";

import { motion } from "framer-motion";
import { useJourneyStore, CAT_MILESTONES } from "@/store/useJourneyStore";
import { vibrate } from "@/lib/haptics";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

/** Green when the value is in a good place, amber in the middle, terracotta
 *  when it needs attention. `invert` flips which end is "good" — fatigue is
 *  bad when high, hunger/thirst are bad when low. */
function ringColor(value: number, invert: boolean) {
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

/** How far `count` is between the previous and next cat milestone, as 0-100 —
 *  keeps growing in 25-step chunks once past the last defined milestone. */
function catRingProgress(count: number) {
  const prev = [0, ...CAT_MILESTONES].reduce((acc, m) => (m <= count ? m : acc), 0);
  const next = CAT_MILESTONES.find((m) => m > count) ?? prev + 25;
  const span = next - prev;
  return span > 0 ? ((count - prev) / span) * 100 : 100;
}

const SIZE = 40;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Apple Watch-style circular progress ring, with arbitrary content centered inside. */
function Ring({
  value,
  color,
  title,
  children,
}: {
  value: number;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} title={title}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(41,37,36,0.08)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={SPRING}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm leading-none">{children}</div>
    </div>
  );
}

/** Floating glassmorphism status HUD, RPG-style — Apple Watch-esque radial rings. */
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
        className="glass-panel pointer-events-auto flex items-center gap-2.5 rounded-full px-3 py-2 shadow-lg"
      >
        <Ring value={fatigue} color={ringColor(fatigue, true)} title="Fatigue">
          {fatigueEmoji(fatigue)}
        </Ring>
        <Ring value={hunger} color={ringColor(hunger, false)} title="Hunger">
          🍽️
        </Ring>
        <Ring value={thirst} color={ringColor(thirst, false)} title="Thirst">
          💧
        </Ring>

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
          className="relative"
        >
          <Ring value={catRingProgress(catsPetted)} color="var(--color-terracotta-500)" title="Cats petted">
            🐾
          </Ring>
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
