"use client";

import { useEffect, useRef } from "react";
import { useJourneyStore } from "@/store/useJourneyStore";
import { useTripStore } from "@/store/useTripStore";
import { getOrCreatePlayerId, getPlayerName, type GmOverride } from "@/lib/telemetry";

const TELEMETRY_POST_MS = 20000;
const OVERRIDE_POLL_MS = 15000;

/**
 * The traveler-side half of the Game Master architecture: periodically
 * reports this browser's live location + RPG stats to /api/sync/player for
 * the admin dashboard's live map and player cards, and polls
 * /api/sync/overrides/[playerId] for any GM actions (heal, water, cat,
 * cure fatigue) queued against this player — applying each one locally via
 * useJourneyStore.applyGmOverride (which also surfaces the GmToast) the
 * moment it's picked up, then clearing the queue so it isn't replayed.
 */
export function useSyncTelemetry() {
  const appliedIdsRef = useRef(new Set<string>());
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    const playerId = getOrCreatePlayerId();
    if (!playerId) return;

    async function postTelemetry() {
      const journey = useJourneyStore.getState();
      const tripId = useTripStore.getState().trip.id;
      if (!tripId) return;
      try {
        await fetch("/api/sync/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId,
            tripId,
            playerName: getPlayerName(),
            lat: journey.liveLocation?.lat ?? null,
            lng: journey.liveLocation?.lng ?? null,
            stats: {
              hunger: journey.hunger,
              thirst: journey.thirst,
              catCount: journey.catsPetted,
              fatigueLevel: journey.fatigue,
            },
          }),
        });
      } catch {
        // Best-effort — a missed beat just means a stale dot on the GM's map.
      }
    }

    async function pollOverrides() {
      // A background tab's throttled timers tend to fire in a catch-up
      // burst right after it's foregrounded — this, plus the server
      // consuming overrides atomically on read, is belt-and-suspenders
      // against ever double-applying the same GM action.
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const res = await fetch(`/api/sync/overrides/${playerId}`, { cache: "no-store" });
        if (!res.ok) return;
        const overrides = (await res.json()) as GmOverride[];
        const journey = useJourneyStore.getState();
        overrides.forEach((o) => {
          if (appliedIdsRef.current.has(o.id)) return;
          appliedIdsRef.current.add(o.id);
          journey.applyGmOverride(o.action);
        });
      } catch {
        // Try again next poll.
      } finally {
        pollInFlightRef.current = false;
      }
    }

    postTelemetry();
    pollOverrides();
    const postInterval = setInterval(postTelemetry, TELEMETRY_POST_MS);
    const pollInterval = setInterval(pollOverrides, OVERRIDE_POLL_MS);
    return () => {
      clearInterval(postInterval);
      clearInterval(pollInterval);
    };
  }, []);
}
