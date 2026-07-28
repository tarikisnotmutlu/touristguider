"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { haversineMeters } from "@/lib/geo";
import Modal from "./Modal";

const TIPS = [
  "Nod confidently and say 'ah, interesting' — works in every language.",
  "When in doubt, follow anyone carrying a map bigger than yours.",
  "Locals always sprint for buses that are 'about to leave' for the next 20 minutes.",
  "The best directions are the ones given with the most hand gestures.",
  "If you smell fresh bread, you're already going the right way.",
  "Getting lost is just an unscheduled walking tour. You're welcome.",
];

export default function PanicButton() {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [nearest, setNearest] = useState<string | null>(null);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

  const day = trip.days[activeDayIndex];

  function locate() {
    if (!day) return;
    setStatus("Locating…");
    setNearest(null);
    if (!navigator.geolocation) {
      setStatus("Your browser won't share location — just wing it. 🧭");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const points = [
          { name: day.startPoint.name, lat: day.startPoint.lat, lng: day.startPoint.lng },
          ...day.steps,
        ];
        let best = points[0];
        let bestDist = Infinity;
        for (const p of points) {
          const d = haversineMeters(here, p);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        setNearest(`${best.name} is about ${(bestDist / 1000).toFixed(1)} km away.`);
        setStatus("");
      },
      () => setStatus("Couldn't get your location — classic. Ask a pigeon. 🐦"),
      { timeout: 8000 }
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setNearest(null);
          setStatus("");
        }}
        type="button"
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-2xl text-white shadow-lg active:scale-95 md:bottom-6"
        aria-label="Panic button"
      >
        🆘
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3 text-center">
          <h3 className="text-xl font-bold">You are not lost. You are exploring. 🧭</h3>
          <p className="text-sm text-slate-500">{tip}</p>
          <button
            onClick={locate}
            type="button"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Find nearest planned stop
          </button>
          {status && <p className="text-xs text-slate-400">{status}</p>}
          {nearest && <p className="text-sm font-medium text-slate-700">{nearest}</p>}
          <button onClick={() => setOpen(false)} type="button" className="text-xs text-slate-400 underline">
            close
          </button>
        </div>
      </Modal>
    </>
  );
}
