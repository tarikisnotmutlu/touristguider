"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { ensureSessionExists, subscribeToTrip } from "@/lib/tripSync";
import AppShell from "./AppShell";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Hydrates the store from Firestore (real-time, offline-persisted) and keeps
 * it live-synced from there — `sessionId` is the single source of truth, so
 * anyone in the same session sees the same itinerary. While Edit Mode is on,
 * incoming snapshots are ignored (see the deferred-save architecture in
 * tripSync.ts) so a remote update can never clobber an in-progress local
 * edit; they resume applying the instant Edit Mode ends.
 */
export default function TripLoader({ sessionId }: { sessionId: string }) {
  const [ready, setReady] = useState(false);
  const setTrip = useTripStore((s) => s.setTrip);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        await ensureSessionExists(sessionId);
      } catch {
        // Offline on first-ever visit to this session id — subscribeToTrip
        // below will still populate from cache/server once reachable.
      }
      if (cancelled) return;

      unsubscribe = subscribeToTrip(sessionId, (trip) => {
        // Edit Mode is authoritative over local state until the user hits
        // Done — a live update from someone else (or an echo of your own
        // save) must never overwrite in-progress, unsaved edits.
        if (useJourneyStore.getState().isEditMode) return;
        setTrip(trip);
        if (!hydratedRef.current) {
          hydratedRef.current = true;
          setReady(true);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [sessionId, setTrip]);

  if (!ready) {
    return <LoadingSpinner label="Loading itinerary…" />;
  }

  return <AppShell />;
}
