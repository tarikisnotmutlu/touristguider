"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore, FATIGUE_PER_METER, MEAL_BOOST } from "@/store/useJourneyStore";
import { haversineMeters } from "@/lib/geo";
import { vibrate } from "@/lib/haptics";
import { useSyncTelemetry } from "@/hooks/useSyncTelemetry";
import { fetchTrip } from "@/lib/tripApi";
import type { LatLng } from "@/lib/types";

const ARRIVAL_RADIUS_M = 20;
const GEM_UNLOCK_RADIUS_M = 20;
const TICK_MS = 2000;
const DECAY_TICK_MS = 60000;
const GEM_POLL_MS = 25000;
const WALK_DISTANCE_THRESHOLD_M = 10;
const WALK_DECAY_MULTIPLIER = 1.5;

/**
 * Headless "game loop" for the live trip experience — mounted once in
 * AppShell, renders nothing. Owns:
 *  1. Fatigue recovery while resting, every TICK_MS, plus the Istanbul
 *     midnight rollover check.
 *  2. Hunger/thirst decay once a minute, with a walking-speed multiplier.
 *  3. Manages the navigator.geolocation.watchPosition lifecycle tied to `dayStarted`.
 *  4. Geofences the live position against the day's next incomplete stop, and
 *     syncs fatigue/hunger when a step is freshly checked off.
 *  5. Geofences the live position against geo-locked hidden gems.
 *  6. Via useSyncTelemetry: reports location/stats to the Game Master
 *     dashboard and applies any GM overrides it queues.
 */
export default function JourneyEngine() {
  const dayStarted = useJourneyStore((s) => s.dayStarted);
  const lastDecayLocationRef = useRef<LatLng | null>(null);

  useSyncTelemetry();

  // --- 0. rehydrate persisted fatigue/hunger/thirst/cats/dayStarted/tab from
  //     localStorage once we're on the client (skipped during SSR), sync the
  //     restored tab's day index into useTripStore, then back-fill however
  //     much hunger/thirst should have depleted while the app was closed ---
  useEffect(() => {
    const result = useJourneyStore.persist.rehydrate();
    Promise.resolve(result).then(() => {
      const journey = useJourneyStore.getState();
      journey.checkMidnightReset();
      journey.applyOfflineDecay();
      if (journey.panelView !== "day") return;
      const dayCount = useTripStore.getState().trip.days.length;
      if (dayCount === 0) return;
      const clamped = Math.min(Math.max(journey.savedDayIndex, 0), dayCount - 1);
      useTripStore.getState().setActiveDayIndex(clamped);
    });
  }, []);

  // --- 1. fatigue recovery + midnight rollover check ---
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = TICK_MS / 1000;
      const journey = useJourneyStore.getState();
      if (journey.restingStepId) journey.tickRecovery(seconds);
      journey.checkMidnightReset();
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- 2. hunger/thirst decay, once a minute, with a walking multiplier
  //     based on how far the visitor moved since the previous tick ---
  useEffect(() => {
    const interval = setInterval(() => {
      const journey = useJourneyStore.getState();
      const prevLocation = lastDecayLocationRef.current;
      const currentLocation = journey.dayStarted ? journey.liveLocation : null;

      let multiplier = 1;
      if (prevLocation && currentLocation) {
        const movedM = haversineMeters(prevLocation, currentLocation);
        if (movedM > WALK_DISTANCE_THRESHOLD_M) multiplier = WALK_DECAY_MULTIPLIER;
      }
      lastDecayLocationRef.current = currentLocation;

      journey.tickMinuteDecay(1, multiplier);
    }, DECAY_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- 3. geolocation watch lifecycle ---
  useEffect(() => {
    if (!dayStarted) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        useJourneyStore
          .getState()
          .setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Silently ignore — the map just won't show a live dot without permission.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    useJourneyStore.getState().setWatchId(id);

    return () => navigator.geolocation.clearWatch(id);
  }, [dayStarted]);

  // --- 4a. geofencing: distance to the day's next incomplete stop ---
  useEffect(() => {
    function checkProximity() {
      const journey = useJourneyStore.getState();
      if (!journey.dayStarted || !journey.liveLocation) return;
      const trip = useTripStore.getState();
      const day = trip.trip.days[trip.activeDayIndex];
      const nextStep = day?.steps.find((s) => !s.completed);

      if (!nextStep) {
        if (journey.restingStepId) journey.setRestingStepId(null);
        return;
      }

      const distanceM = haversineMeters(journey.liveLocation, { lat: nextStep.lat, lng: nextStep.lng });
      if (distanceM <= ARRIVAL_RADIUS_M) {
        if (journey.restingStepId !== nextStep.id) {
          journey.setRestingStepId(nextStep.id);
          journey.triggerArrival(nextStep.id, nextStep.name);
          vibrate([100, 50, 100, 50, 200]);
        }
      } else if (journey.restingStepId === nextStep.id) {
        journey.setRestingStepId(null);
      }
    }

    checkProximity();
    const unsubTrip = useTripStore.subscribe(checkProximity);
    const unsubJourney = useJourneyStore.subscribe(checkProximity);
    return () => {
      unsubTrip();
      unsubJourney();
    };
  }, []);

  // --- 4b. sync fatigue/hunger when a step transitions to completed ---
  useEffect(() => {
    const unsub = useTripStore.subscribe((state, prevState) => {
      const day = state.trip.days[state.activeDayIndex];
      const prevDay = prevState.trip.days[prevState.activeDayIndex];
      if (!day || !prevDay || day.id !== prevDay.id) return;

      day.steps.forEach((step, i) => {
        const prevStep = prevDay.steps.find((s) => s.id === step.id);
        if (!prevStep || prevStep.completed || !step.completed) return;

        const route = day.routes[i];
        if (route?.mode === "walk" && route.distanceM) {
          useJourneyStore.getState().addFatigue(route.distanceM * FATIGUE_PER_METER);
        }
        if (step.category === "restaurant" || step.category === "cafe") {
          useJourneyStore.getState().feed(MEAL_BOOST);
        }
      });
    });
    return unsub;
  }, []);

  // --- 5. geofencing: geo-locked hidden gems within unlock range ---
  useEffect(() => {
    function checkGems() {
      const journey = useJourneyStore.getState();
      if (!journey.dayStarted || !journey.liveLocation) return;
      const { hiddenGems } = useTripStore.getState().trip;

      for (const gem of hiddenGems) {
        if (!gem.geoLocked) continue;
        if (journey.discoveredGemIds.includes(gem.id)) continue;
        const distanceM = haversineMeters(journey.liveLocation, { lat: gem.lat, lng: gem.lng });
        if (distanceM <= (gem.radiusM ?? GEM_UNLOCK_RADIUS_M)) {
          journey.triggerGemUnlock(gem.id, gem.note, gem.imageBase64 ?? gem.imageUrl);
          vibrate([100, 50, 100, 50, 200]);
        }
      }
    }

    checkGems();
    const unsubTrip = useTripStore.subscribe(checkGems);
    const unsubJourney = useJourneyStore.subscribe(checkGems);
    return () => {
      unsubTrip();
      unsubJourney();
    };
  }, []);

  // --- 6. background poll for hidden gems the Game Master placed via the
  //     Admin Hidden Gem Studio since this trip was loaded — only the gems
  //     array is refetched/replaced, never the rest of the trip, so this
  //     can't clobber the traveler's own in-progress edits. Skips the write
  //     entirely when nothing actually changed, since MapView's marker sync
  //     effect keys off `trip.hiddenGems` by reference and would otherwise
  //     tear down and recreate every gem marker on every poll tick. ---
  useEffect(() => {
    let cancelled = false;
    async function pollGems() {
      const tripId = useTripStore.getState().trip.id;
      if (!tripId) return;
      try {
        const fresh = await fetchTrip(tripId);
        if (cancelled || !fresh) return;
        const current = useTripStore.getState().trip.hiddenGems;
        if (JSON.stringify(fresh.hiddenGems) !== JSON.stringify(current)) {
          useTripStore.getState().setHiddenGems(fresh.hiddenGems);
        }
      } catch {
        // Best-effort — just try again next tick.
      }
    }
    const interval = setInterval(pollGems, GEM_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
