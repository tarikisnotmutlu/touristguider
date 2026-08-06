"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore, FATIGUE_PER_METER, MEAL_BOOST } from "@/store/useJourneyStore";
import { haversineMeters } from "@/lib/geo";
import { vibrate } from "@/lib/haptics";
import { useSyncTelemetry } from "@/hooks/useSyncTelemetry";
import type { LatLng } from "@/lib/types";

const ARRIVAL_RADIUS_M = 20;
const GEM_UNLOCK_RADIUS_M = 20;
const TICK_MS = 2000;
const DECAY_TICK_MS = 60000;
const WALK_DISTANCE_THRESHOLD_M = 10;
const WALK_DECAY_MULTIPLIER = 1.5;

/**
 * Headless "game loop" for the live trip experience — mounted once in
 * AppShell, renders nothing. Owns:
 *  1. Fatigue recovery while resting, every TICK_MS, plus the Istanbul
 *     midnight rollover check.
 *  2. Hunger/thirst decay once a minute, with a walking-speed multiplier.
 *  3. Manages the navigator.geolocation.watchPosition lifecycle for the
 *     whole time the app is open (not tied to `dayStarted` — see the
 *     effect itself for why).
 *  4. Geofences the live position against the day's next incomplete stop, and
 *     syncs fatigue/hunger when a step is freshly checked off.
 *  5. Geofences the live position against geo-locked hidden gems.
 *  6. Via useSyncTelemetry: reports location/stats to the Admin
 *     dashboard and applies any GM overrides it queues.
 *
 *  Hidden gems the Admin places arrive live via TripLoader's Firestore
 *  gems subscription (no polling needed) — this file only reacts to them.
 */
export default function JourneyEngine() {
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
  // Runs for the whole time the app is open, independent of `dayStarted` —
  // the Admin wants to see where someone is the moment they join, not only
  // after they've found and tapped "Start Day" (a step easy to miss, and
  // the #1 reason a traveler's dot silently never appeared on the admin
  // map). `dayStarted` still separately gates the RPG mechanics that
  // consume liveLocation (fatigue/hunger decay pacing, arrival/gem
  // geofencing) — see their own `journey.dayStarted` checks below — so
  // sharing location earlier doesn't change when those kick in. Only
  // stopLocationSharing (session eviction) actually tears this down.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        useJourneyStore
          .getState()
          .setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        // PERMISSION_DENIED is the one case worth telling the visitor about
        // (their "waiting for location…" would otherwise sit stuck forever
        // with no explanation) — POSITION_UNAVAILABLE/TIMEOUT are usually
        // transient (weak signal, still acquiring a first fix) and
        // watchPosition itself keeps retrying, so those stay silent.
        if (err.code === err.PERMISSION_DENIED) {
          useJourneyStore.getState().setLocationPermissionDenied(true);
        }
      },
      // A first GPS fix (especially indoors/high-accuracy) can genuinely
      // take longer than the old 15s budget, and 5s of cache reuse forced a
      // brand new fix on almost every tick — both made a temporarily weak
      // signal look identical to "permission denied" from the UI's
      // perspective. More slack here, not less accuracy.
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
    useJourneyStore.getState().setWatchId(id);

    return () => navigator.geolocation.clearWatch(id);
  }, []);

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
          journey.triggerGemUnlock(gem.id, gem.note, gem.imageUrl, gem.driveSecretUrl);
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

  return null;
}
