"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { subscribeToTrip } from "@/lib/tripSync";
import AppShell from "./AppShell";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Hydrates the store from Firestore (real-time, offline-persisted) and keeps
 * it live-synced from there — `sessionId` is the single source of truth, so
 * anyone in the same session sees the same itinerary. While Edit Mode is on,
 * incoming snapshots are ignored (see the deferred-save architecture in
 * tripSync.ts) so a remote update can never clobber an in-progress local
 * edit; they resume applying the instant Edit Mode ends.
 *
 * Deliberately never creates the session — by the time this mounts, the
 * /[sessionId] route guard has already confirmed the browser came through
 * the password-gated lobby login, which itself already confirmed the
 * session exists (see lib/tripSync.ts's verifySessionCredentials). Session
 * creation is 100% isolated to the Admin panel.
 */
export default function TripLoader({ sessionId }: { sessionId: string }) {
  const [ready, setReady] = useState(false);
  const setTrip = useTripStore((s) => s.setTrip);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;

    const unsubscribe = subscribeToTrip(sessionId, (trip) => {
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

    return unsubscribe;
  }, [sessionId, setTrip]);

  if (!ready) {
    return <LoadingSpinner label="Loading itinerary…" />;
  }

  return <AppShell />;
}
