"use client";

import { useEffect, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { readTripFromLocation } from "@/lib/share";
import { createDemoTrip } from "@/lib/seed";
import AppShell from "./AppShell";

/** Hydrates the store from a shared `?data=` link if present, else seeds a demo trip. */
export default function TripLoader() {
  const [ready, setReady] = useState(false);
  const setTrip = useTripStore((s) => s.setTrip);

  useEffect(() => {
    const shared = readTripFromLocation();
    setTrip(shared ?? createDemoTrip());
    // window.location is only readable client-side, so this one-time hydration
    // gate can't be computed during the (SSR-matching) first render — it has to
    // flip after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-slate-100 text-slate-500">
        Loading itinerary…
      </div>
    );
  }

  return <AppShell />;
}
