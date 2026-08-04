"use client";

import { useEffect, useRef } from "react";
import { onSnapshot, deleteDoc, setDoc } from "firebase/firestore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { useTripStore } from "@/store/useTripStore";
import { getPlayerName } from "@/lib/session";
import { playerDocRef, playerOverridesCollection, playerOverrideDocRef } from "@/lib/firestorePaths";
import { playerColor } from "@/lib/playerColor";
import type { GmOverride } from "@/lib/telemetry";

const TELEMETRY_POST_MS = 20000;

/**
 * The traveler-side half of the Game Master architecture: periodically
 * writes this browser's live location + RPG stats to
 * sessions/{sessionId}/players/{playerName} for the admin dashboard's live
 * map and player cards, and listens in real time (onSnapshot, no polling)
 * on .../players/{playerName}/overrides for any GM actions queued against
 * this player — applying each one locally via
 * useJourneyStore.applyGmOverride (which also surfaces the GmToast) the
 * moment it lands, then deleting the doc so it isn't replayed.
 */
export function useSyncTelemetry() {
  const appliedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const rawPlayerName = getPlayerName();
    const sessionId = useTripStore.getState().trip.id;
    if (!rawPlayerName || !sessionId) return;
    const playerName: string = rawPlayerName;

    async function postTelemetry() {
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

    return () => {
      clearInterval(postInterval);
      unsubOverrides();
    };
  }, []);
}
