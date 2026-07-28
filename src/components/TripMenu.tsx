"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { genId } from "@/lib/id";
import { getMyTrips, forgetTrip, type LocalTripEntry } from "@/lib/localTrips";
import { useTripStore } from "@/store/useTripStore";

export default function TripMenu() {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<LocalTripEntry[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const currentTripId = useTripStore((s) => s.trip.id);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) setTrips(getMyTrips());
        }}
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
        title="My trips"
      >
        📂
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="glass-panel absolute right-0 z-30 mt-1.5 w-64 rounded-2xl p-2 shadow-xl"
          >
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/t/${genId()}`);
              }}
              type="button"
              className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-stone-700 hover:bg-sage-50"
            >
              🆕 New trip
            </button>
            <div className="max-h-56 overflow-y-auto">
              {trips.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-stone-400">No saved trips on this device yet.</p>
              )}
              {trips.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center rounded-xl px-2 py-1.5 text-sm hover:bg-stone-100"
                >
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push(`/t/${t.id}`);
                    }}
                    type="button"
                    className={
                      "min-w-0 flex-1 truncate text-left " +
                      (t.id === currentTripId ? "font-semibold text-sage-700" : "text-stone-700")
                    }
                  >
                    {t.title || "Untitled trip"}
                  </button>
                  <button
                    onClick={() => {
                      forgetTrip(t.id);
                      setTrips(getMyTrips());
                    }}
                    type="button"
                    title="Remove from this list"
                    className="ml-1 shrink-0 text-stone-300 opacity-0 hover:text-terracotta-600 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
