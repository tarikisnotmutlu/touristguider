"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { fetchTrip, saveTrip } from "@/lib/tripApi";
import { createDemoTrip } from "@/lib/seed";
import { rememberTrip } from "@/lib/localTrips";
import AppShell from "./AppShell";

const AUTOSAVE_DELAY_MS = 1200;

/**
 * Hydrates the store from the server (Vercel Blob, keyed by `tripId`) and keeps it
 * saved back there on every change — the URL is the single source of truth, so
 * refreshing or sharing the link always shows the same, current itinerary.
 */
export default function TripLoader({ tripId }: { tripId: string }) {
  // Tracks which trip id the store is currently hydrated for, rather than a
  // separate "loading" boolean — `ready` is derived from comparing the two.
  const [readyForTripId, setReadyForTripId] = useState<string | null>(null);
  const setTrip = useTripStore((s) => s.setTrip);
  const setSaveState = useTripStore((s) => s.setSaveState);
  const trip = useTripStore((s) => s.trip);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;

    (async () => {
      const existing = await fetchTrip(tripId);
      if (cancelled) return;
      if (existing) {
        setTrip(existing);
      } else {
        const fresh = createDemoTrip();
        fresh.id = tripId;
        setTrip(fresh);
        await saveTrip(fresh);
      }
      if (cancelled) return;
      hydratedRef.current = true;
      setReadyForTripId(tripId);
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, setTrip]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    rememberTrip(trip.id, trip.title);
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ok = await saveTrip(trip);
      setSaveState(ok ? "saved" : "idle");
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [trip, setSaveState]);

  if (readyForTripId !== tripId) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-stone-50 text-stone-400">
        Loading itinerary…
      </div>
    );
  }

  return <AppShell />;
}
