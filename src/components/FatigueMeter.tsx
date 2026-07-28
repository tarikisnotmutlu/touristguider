"use client";

import { useTripStore } from "@/store/useTripStore";
import { totalWalkingMeters } from "@/lib/time";

const LEVELS = [
  { max: 2000, label: "Fresh legs 🌱", color: "bg-green-500" },
  { max: 5000, label: "Warmed up 🚶", color: "bg-lime-500" },
  { max: 8000, label: "Getting real 😅", color: "bg-amber-500" },
  { max: 12000, label: "Blister o'clock 🩹", color: "bg-orange-500" },
  { max: Infinity, label: "Send help 🥵", color: "bg-red-500" },
];

export default function FatigueMeter({ dayId }: { dayId: string }) {
  const day = useTripStore((s) => s.trip.days.find((d) => d.id === dayId));
  if (!day) return null;

  const meters = totalWalkingMeters(day);
  const level = LEVELS.find((l) => meters <= l.max)!;
  const pct = Math.min(100, (meters / 12000) * 100);

  return (
    <div className="px-3 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between text-slate-500">
        <span>Tourist Fatigue Meter</span>
        <span className="font-medium">{(meters / 1000).toFixed(1)} km walked</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${level.color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-slate-500">{level.label}</p>
    </div>
  );
}
