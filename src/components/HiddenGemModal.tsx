"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { haversineMeters } from "@/lib/geo";
import { vibrate } from "@/lib/haptics";

const UNLOCK_RADIUS_M = 20;

type CreatorPhase = "creator" | "checking" | "error";

/** Desktop creator view: always shows the note (you placed the pin), lets you
 *  delete it. Mobile taps never reach this — see the effect below, which
 *  routes them straight to a toast or the full unlock reveal instead. */
export default function HiddenGemModal() {
  const trip = useTripStore((s) => s.trip);
  const activeGemId = useTripStore((s) => s.activeGemId);
  const setActiveGemId = useTripStore((s) => s.setActiveGemId);
  const removeHiddenGem = useTripStore((s) => s.removeHiddenGem);
  const triggerGemUnlock = useJourneyStore((s) => s.triggerGemUnlock);
  const showGemHint = useJourneyStore((s) => s.showGemHint);
  const unlockedGem = useJourneyStore((s) => s.unlockedGem);
  const clearGemUnlock = useJourneyStore((s) => s.clearGemUnlock);

  const gem = trip.hiddenGems.find((g) => g.id === activeGemId) ?? null;
  const [phase, setPhase] = useState<CreatorPhase>("checking");
  const [resolvedForGemId, setResolvedForGemId] = useState<string | null>(null);
  const displayPhase: CreatorPhase = resolvedForGemId === gem?.id ? phase : "checking";

  // Clicking a gem marker: on desktop (the creator) always shows the note.
  // On mobile, this is a "did I discover it?" check — never a modal for a
  // gem that's still out of range, just a quick toast.
  useEffect(() => {
    if (!gem) return;
    const gemId = gem.id;
    const note = gem.note;
    const geoLocked = gem.geoLocked;

    Promise.resolve().then(() => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        setPhase("creator");
        setResolvedForGemId(gemId);
        return;
      }

      if (!geoLocked) {
        triggerGemUnlock(gemId, note);
        setActiveGemId(null);
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
          if (d <= UNLOCK_RADIUS_M) {
            triggerGemUnlock(gemId, note);
          } else {
            showGemHint();
          }
          setActiveGemId(null);
        },
        () => {
          setPhase("error");
          setResolvedForGemId(gemId);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, [gem, triggerGemUnlock, showGemHint, setActiveGemId]);

  return (
    <>
      <AnimatePresence>
        {gem && displayPhase !== "checking" && (
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
              {displayPhase === "creator" && (
                <>
                  <div className="text-4xl">✨</div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-stone-800">
                    Your hidden gem
                  </h3>
                  <p className="mt-1 text-xs text-stone-400">
                    {gem.geoLocked ? "🔒 Geo-locked — must be nearby to unlock" : "Not geo-locked — unlocks instantly"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{gem.note}</p>
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

      <GemUnlockReveal note={unlockedGem?.note ?? null} onClose={clearGemUnlock} />
    </>
  );
}

/** Full-screen scavenger-hunt reveal — triggered either by JourneyEngine's
 *  passive geofencing or by tapping a gem while within range. */
function GemUnlockReveal({ note, onClose }: { note: string | null; onClose: () => void }) {
  useEffect(() => {
    if (note != null) vibrate([100, 50, 100, 50, 200]);
  }, [note]);

  return (
    <AnimatePresence>
      {note != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 24 }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.6 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-sm rounded-3xl p-7 text-center shadow-2xl"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.7, delay: 0.1 }}
              className="text-5xl"
            >
              ✨
            </motion.div>
            <h3 className="mt-3 text-xl font-bold tracking-tight text-stone-800">Hidden Gem Unlocked!</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{note}</p>
            <button
              onClick={onClose}
              type="button"
              className="mt-5 rounded-full bg-terracotta-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700"
            >
              Nice!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
