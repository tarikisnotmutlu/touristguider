"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        title="My trips"
      >
        📂
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              router.push(`/t/${genId()}`);
            }}
            type="button"
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-indigo-50"
          >
            🆕 New trip
          </button>
          <div className="max-h-56 overflow-y-auto">
            {trips.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-slate-400">No saved trips on this device yet.</p>
            )}
            {trips.map((t) => (
              <div
                key={t.id}
                className="group flex items-center rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <button
                  onClick={() => {
                    setOpen(false);
                    router.push(`/t/${t.id}`);
                  }}
                  type="button"
                  className={
                    "min-w-0 flex-1 truncate text-left " +
                    (t.id === currentTripId ? "font-semibold text-indigo-600" : "text-slate-700")
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
                  className="ml-1 shrink-0 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
