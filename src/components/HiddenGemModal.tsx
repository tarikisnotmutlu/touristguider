"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { haversineMeters } from "@/lib/geo";

const UNLOCK_RADIUS_M = 10;

type Phase = "creator" | "locating" | "locked" | "unlocked" | "error";

export default function HiddenGemModal() {
  const trip = useTripStore((s) => s.trip);
  const activeGemId = useTripStore((s) => s.activeGemId);
  const setActiveGemId = useTripStore((s) => s.setActiveGemId);
  const removeHiddenGem = useTripStore((s) => s.removeHiddenGem);

  const gem = trip.hiddenGems.find((g) => g.id === activeGemId) ?? null;
  const [phase, setPhase] = useState<Phase>("locating");
  const [distanceM, setDistanceM] = useState<number | null>(null);
  // Tracks which gem `phase` was actually resolved for, so switching straight
  // from one gem to another shows "locating" again instead of the previous
  // gem's stale locked/unlocked state for a frame.
  const [resolvedForGemId, setResolvedForGemId] = useState<string | null>(null);
  const displayPhase: Phase = resolvedForGemId === gem?.id ? phase : "locating";

  useEffect(() => {
    if (!gem) return;

    // On desktop you're the one who placed the pin — no need to prove you're
    // standing next to it. On mobile (where a friend would actually be
    // exploring the city) it's geofenced. Resolved asynchronously (even the
    // synchronous desktop branch) so state updates happen in a callback
    // rather than directly in the effect body.
    const gemId = gem.id;
    Promise.resolve().then(() => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        setPhase("creator");
        setResolvedForGemId(gemId);
        return;
      }
      if (!navigator.geolocation) {
        setPhase("error");
        setResolvedForGemId(gemId);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = haversineMeters(
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            { lat: gem.lat, lng: gem.lng }
          );
          setDistanceM(d);
          setPhase(d <= UNLOCK_RADIUS_M ? "unlocked" : "locked");
          setResolvedForGemId(gemId);
        },
        () => {
          setPhase("error");
          setResolvedForGemId(gemId);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, [gem]);

  return (
    <AnimatePresence>
      {gem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-sm"
          onClick={() => setActiveGemId(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl"
          >
            {displayPhase === "locating" && (
              <>
                <div className="text-3xl">📍</div>
                <p className="mt-3 text-sm text-stone-500">Checking how close you are…</p>
              </>
            )}

            {displayPhase === "locked" && (
              <>
                <div className="text-4xl">🔒</div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-stone-800">
                  Hidden gem nearby
                </h3>
                <p className="mt-1.5 text-sm text-stone-500">
                  You must be within {UNLOCK_RADIUS_M}m to unlock this!
                  {distanceM != null && (
                    <>
                      {" "}
                      You&apos;re about <strong>{Math.round(distanceM)}m</strong> away.
                    </>
                  )}
                </p>
              </>
            )}

            {(displayPhase === "unlocked" || displayPhase === "creator") && (
              <>
                <div className="text-4xl">💎</div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-stone-800">
                  {displayPhase === "creator" ? "Your hidden gem" : "Unlocked!"}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                  {gem.note}
                </p>
                {displayPhase === "creator" && (
                  <button
                    onClick={() => {
                      removeHiddenGem(gem.id);
                      setActiveGemId(null);
                    }}
                    type="button"
                    className="mt-4 text-xs font-medium text-terracotta-600 hover:text-terracotta-700"
                  >
                    Delete this gem
                  </button>
                )}
              </>
            )}

            {displayPhase === "error" && (
              <>
                <div className="text-3xl">🧭</div>
                <p className="mt-3 text-sm text-stone-500">
                  Couldn&apos;t get your location — enable location access to unlock this gem.
                </p>
              </>
            )}

            <button
              onClick={() => setActiveGemId(null)}
              type="button"
              className="mt-5 text-xs font-medium text-stone-400 underline underline-offset-2 hover:text-stone-600"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
