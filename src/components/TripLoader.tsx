"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { fetchTrip, saveTrip } from "@/lib/tripApi";
import { createDemoTrip } from "@/lib/seed";
import { rememberTrip, saveTripSnapshot, loadTripSnapshot } from "@/lib/localTrips";
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
      // fetchTrip can come back null either because the trip genuinely
      // doesn't exist yet, or because the request itself failed (offline,
      // Blob hiccup) — either way, prefer whatever's mirrored in
      // localStorage over silently starting from a blank demo trip.
      let existing = null;
      try {
        existing = await fetchTrip(tripId);
      } catch {
        existing = null;
      }
      if (cancelled) return;
      if (existing) {
        setTrip(existing);
      } else {
        const local = loadTripSnapshot(tripId);
        if (local) {
          setTrip(local);
          // Best-effort push back to the server now that we're reading —
          // if it fails again we're still safely on the local copy.
          saveTrip(local);
        } else {
          const fresh = createDemoTrip();
          fresh.id = tripId;
          setTrip(fresh);
          saveTripSnapshot(fresh);
          await saveTrip(fresh);
        }
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
    // Written synchronously on every change (add a stop, toggle done,
    // reorder, edit an ETA...) rather than debounced like the network
    // save — a reload half a second after an edit should never lose it.
    saveTripSnapshot(trip);
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
