"use client";

import { useEffect, useRef } from "react";
import { onSnapshot, deleteDoc, setDoc } from "firebase/firestore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { useTripStore } from "@/store/useTripStore";
import { clearSessionIdentity, getPlayerName } from "@/lib/session";
import { playerDocRef, playerOverridesCollection, playerOverrideDocRef } from "@/lib/firestorePaths";
import { playerColor } from "@/lib/playerColor";
import type { GmOverride } from "@/lib/telemetry";

const TELEMETRY_POST_MS = 20000;

/**
 * The traveler-side half of the Admin architecture: periodically
 * writes this browser's live location + RPG stats to
 * sessions/{sessionId}/players/{playerName} for the admin dashboard's live
 * map and player cards, and listens in real time (onSnapshot, no polling)
 * on .../players/{playerName}/overrides for any GM actions queued against
 * this player — applying each one locally via
 * useJourneyStore.applyGmOverride (which also surfaces the GmToast) the
 * moment it lands, then deleting the doc so it isn't replayed. Also watches
 * this player's own doc so an Admin deletion (a "kick") can be detected and
 * evicted below, rather than silently re-created by the next telemetry beat.
 */
export function useSyncTelemetry() {
  const appliedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const rawPlayerName = getPlayerName();
    const sessionId = useTripStore.getState().trip.id;
    if (!rawPlayerName || !sessionId) return;
    const playerName: string = rawPlayerName;

    // Flips true once the eviction sequence starts, so any in-flight
    // interval tick or snapshot callback becomes a no-op instead of racing
    // the reload (or, worse, re-creating the just-deleted doc).
    let evicted = false;
    // Only a doc that *existed and then disappeared* counts as a kick — the
    // brief window between mount and this player's very first postTelemetry()
    // write (where the doc genuinely doesn't exist yet) must never be
    // misread as an eviction.
    let hasSeenDocExist = false;

    async function postTelemetry() {
      if (evicted) return;
      const journey = useJourneyStore.getState();
      try {
        await setDoc(playerDocRef(sessionId, playerName), {
          lat: journey.liveLocation?.lat ?? null,
          lng: journey.liveLocation?.lng ?? null,
          stats: {
            hunger: journey.hunger,
            thirst: journey.thirst,
            catCount: journey.catsPetted,
            fatigueLevel: journey.fatigue,
          },
          timestamp: Date.now(),
          color: playerColor(playerName),
        });
      } catch {
        // Best-effort — a missed beat just means a stale dot on the GM's map.
      }
    }

    postTelemetry();
    const postInterval = setInterval(postTelemetry, TELEMETRY_POST_MS);

    const unsubOverrides = onSnapshot(playerOverridesCollection(sessionId, playerName), (snap) => {
      if (evicted) return;
      const journey = useJourneyStore.getState();
      snap.docs.forEach((docSnap) => {
        if (appliedIdsRef.current.has(docSnap.id)) return;
        appliedIdsRef.current.add(docSnap.id);
        const override = docSnap.data() as GmOverride;
        journey.applyGmOverride(override.action, override.text);
        deleteDoc(playerOverrideDocRef(sessionId, playerName, docSnap.id)).catch(() => {
          // Best-effort — worst case the same action re-applies once more.
        });
      });
    });

    const unsubSelf = onSnapshot(playerDocRef(sessionId, playerName), (snap) => {
      if (evicted) return;
      if (snap.exists()) {
        hasSeenDocExist = true;
        return;
      }
      if (!hasSeenDocExist) return;
      evicted = true;

      // Stop everything first — geolocation watch, telemetry beat, override
      // listener — so nothing keeps running (or re-creates the deleted doc)
      // while the alert below is blocking on the user.
      clearInterval(postInterval);
      unsubOverrides();
      unsubSelf();
      useJourneyStore.getState().stopDay();

      alert("You have been removed from the session by the admin.");

      // Wipe local credentials and reload — the cleanest way to fully reset
      // every store/listener in the app and land back on the onboarding
      // gate, matching the same pattern TripMenu's "Exit" action uses.
      clearSessionIdentity();
      window.location.reload();
    });

    return () => {
      clearInterval(postInterval);
      unsubOverrides();
      unsubSelf();
    };
  }, []);
}
