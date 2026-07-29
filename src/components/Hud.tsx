"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { useJourneyStore, MEAL_BOOST } from "@/store/useJourneyStore";
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
  if (value <= 85) return "😥";
  return "😵";
}

const SIZE = 40;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Apple Watch-style circular progress ring. Interactive when `onTap` is
 *  given — becomes a tappable button that fills the ring on the spot
 *  (Thirst/Hunger), rather than routing through a separate action button. */
function Ring({
  value,
  color,
  title,
  onTap,
  children,
}: {
  value: number;
  color: string;
  title: string;
  onTap?: () => void;
  children: React.ReactNode;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, value)) / 100);
  const svg = (
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
  );

  if (onTap) {
    return (
      <motion.button
        type="button"
        onClick={onTap}
        whileTap={{ scale: 0.88 }}
        transition={SPRING}
        title={title}
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
      >
        {svg}
        <div className="absolute inset-0 flex items-center justify-center text-sm leading-none">
          {children}
        </div>
      </motion.button>
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} title={title}>
      {svg}
      <div className="absolute inset-0 flex items-center justify-center text-sm leading-none">{children}</div>
    </div>
  );
}

/** Floating glassmorphism status HUD, RPG-style — Apple Watch-esque radial
 *  rings. Thirst/Hunger rings are themselves the "drink"/"eat" buttons; no
 *  separate controls needed. */
export default function Hud() {
  const fatigue = useJourneyStore((s) => s.fatigue);
  const hunger = useJourneyStore((s) => s.hunger);
  const thirst = useJourneyStore((s) => s.thirst);
  const drinkWater = useJourneyStore((s) => s.drinkWater);
  const feed = useJourneyStore((s) => s.feed);
  const catsPetted = useJourneyStore((s) => s.catsPetted);
  const petCat = useJourneyStore((s) => s.petCat);
  const sheetExpanded = useJourneyStore((s) => s.sheetExpanded);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-4 lg:left-[400px] lg:justify-center">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={sheetExpanded ? { opacity: 0, y: -20 } : { opacity: 1, y: 0 }}
        transition={SPRING}
        className={clsx(
          "glass-panel flex items-center gap-2.5 rounded-full px-3 py-2 shadow-lg",
          sheetExpanded ? "pointer-events-none" : "pointer-events-auto"
        )}
      >
        <Ring value={fatigue} color={ringColor(fatigue, true)} title="Fatigue">
          {fatigueEmoji(fatigue)}
        </Ring>
        <Ring
          value={hunger}
          color={ringColor(hunger, false)}
          title="Tap to eat"
          onTap={() => {
            feed(MEAL_BOOST);
            vibrate(50);
          }}
        >
          🍽️
        </Ring>
        <Ring
          value={thirst}
          color={ringColor(thirst, false)}
          title="Tap to drink"
          onTap={() => {
            drinkWater();
            vibrate(50);
          }}
        >
          💧
        </Ring>

        <div className="h-4 w-px bg-stone-300/70" />

        <motion.button
          onClick={() => {
            petCat();
            vibrate(30);
          }}
          whileTap={{ scale: 0.85 }}
          transition={SPRING}
          type="button"
          title="Pet a cat"
          className="flex items-center gap-1 rounded-full px-1.5 text-sm font-semibold text-stone-700"
        >
          🐾 {catsPetted}
        </motion.button>
      </motion.div>
    </div>
  );
}
