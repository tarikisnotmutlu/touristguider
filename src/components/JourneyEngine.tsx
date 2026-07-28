"use client";

import { useEffect } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore, FATIGUE_PER_METER, MEAL_BOOST } from "@/store/useJourneyStore";
import { haversineMeters } from "@/lib/geo";
import { vibrate } from "@/lib/haptics";

const ARRIVAL_RADIUS_M = 20;
const TICK_MS = 2000;

/**
 * Headless "game loop" for the live trip experience — mounted once in
 * AppShell, renders nothing. Owns three independent jobs:
 *  1. Ticks hunger/thirst decay every TICK_MS, and fatigue recovery while resting.
 *  2. Manages the navigator.geolocation.watchPosition lifecycle tied to `dayStarted`.
 *  3. Geofences the live position against the day's next incomplete stop, and
 *     syncs fatigue/hunger when a step is freshly checked off.
 */
export default function JourneyEngine() {
  const dayStarted = useJourneyStore((s) => s.dayStarted);

  // --- 1. decay/recovery ticking ---
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = TICK_MS / 1000;
      const journey = useJourneyStore.getState();
      journey.tickDecay(seconds);
      if (journey.restingStepId) journey.tickRecovery(seconds);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // --- 2. geolocation watch lifecycle ---
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

  // --- 3a. geofencing: distance to the day's next incomplete stop ---
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

  // --- 3b. sync fatigue/hunger when a step transitions to completed ---
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

  return null;
}
