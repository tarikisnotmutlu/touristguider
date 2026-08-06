"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { useJourneyStore } from "@/store/useJourneyStore";
import { haversineMeters } from "@/lib/geo";
import { vibrate } from "@/lib/haptics";
import { convertDriveLinkToDirectImage } from "@/lib/driveLink";

const UNLOCK_RADIUS_M = 20;

/** Every gem tap — on any screen size — goes through the same geo-lock check
 *  now that gems are only ever placed via the Admin Hidden Gem Studio: no
 *  more desktop "I'm the creator, just show me the note" bypass. In range
 *  (or not geo-locked at all) triggers the full-screen reveal below; still
 *  out of range shows the "get closer" toast; a geolocation failure shows a
 *  small inline error card. Once a gem has been discovered once, it's
 *  permanently open — later taps skip the geofence check entirely and
 *  replay the reveal straight away. */
export default function HiddenGemModal() {
  const trip = useTripStore((s) => s.trip);
  const activeGemId = useTripStore((s) => s.activeGemId);
  const setActiveGemId = useTripStore((s) => s.setActiveGemId);
  const triggerGemUnlock = useJourneyStore((s) => s.triggerGemUnlock);
  const showGemHint = useJourneyStore((s) => s.showGemHint);
  const unlockedGem = useJourneyStore((s) => s.unlockedGem);
  const clearGemUnlock = useJourneyStore((s) => s.clearGemUnlock);
  const locationPermissionDenied = useJourneyStore((s) => s.locationPermissionDenied);

  const gem = trip.hiddenGems.find((g) => g.id === activeGemId) ?? null;
  const [erroredForGemId, setErroredForGemId] = useState<string | null>(null);
  const showError = gem != null && erroredForGemId === gem.id;

  useEffect(() => {
    if (!gem) return;
    const gemId = gem.id;
    const note = gem.note;
    const imageSrc = gem.imageUrl;
    const driveSecretUrl = gem.driveSecretUrl;
    const geoLocked = gem.geoLocked;
    const radiusM = gem.radiusM ?? UNLOCK_RADIUS_M;

    Promise.resolve().then(() => {
      const alreadyDiscovered = useJourneyStore.getState().discoveredGemIds.includes(gemId);
      if (!geoLocked || alreadyDiscovered) {
        triggerGemUnlock(gemId, note, imageSrc, driveSecretUrl);
        setActiveGemId(null);
        return;
      }

      function resolveAgainst(point: { lat: number; lng: number }) {
        const d = haversineMeters(point, { lat: gem!.lat, lng: gem!.lng });
        if (d <= radiusM) {
          triggerGemUnlock(gemId, note, imageSrc, driveSecretUrl);
        } else {
          showGemHint();
        }
        setActiveGemId(null);
      }

      // JourneyEngine's watchPosition has been continuously tracking
      // position since the app loaded (see its own effect) — reuse that
      // instead of firing a brand new, strict one-shot GPS request here.
      // The old code always did the latter, which regularly timed out
      // (10s, no cached-fix tolerance) even on a phone with location
      // fully enabled and already tracking fine elsewhere in the app,
      // showing "enable location access" for what was really just a slow
      // GPS lock, not a permission problem.
      const liveLocation = useJourneyStore.getState().liveLocation;
      if (liveLocation) {
        resolveAgainst(liveLocation);
        return;
      }

      if (!navigator.geolocation) {
        setErroredForGemId(gemId);
        return;
      }
      // Only reached if the continuous watch genuinely has no fix yet —
      // fall back to a one-shot request with the same generous tolerances
      // as the watch, rather than the old much stricter ones.
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          useJourneyStore.getState().setLiveLocation(loc);
          resolveAgainst(loc);
        },
        () => {
          setErroredForGemId(gemId);
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
    });
  }, [gem, triggerGemUnlock, showGemHint, setActiveGemId]);

  return (
    <>
      <AnimatePresence>
        {showError && (
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
              <div className="text-3xl">🧭</div>
              <p className="mt-3 text-sm text-stone-500">
                {locationPermissionDenied
                  ? "Location access is blocked — enable it for this site in your phone's settings to unlock this gem."
                  : "Still finding your location — give it a moment and try again."}
              </p>
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

      <GemUnlockReveal
        note={unlockedGem?.note ?? null}
        imageSrc={unlockedGem?.imageUrl}
        driveSecretUrl={unlockedGem?.driveSecretUrl}
        onClose={clearGemUnlock}
      />
    </>
  );
}

/** Full-screen scavenger-hunt reveal — triggered either by JourneyEngine's
 *  passive geofencing or by tapping a gem while within range. */
function GemUnlockReveal({
  note,
  imageSrc,
  driveSecretUrl,
  onClose,
}: {
  note: string | null;
  imageSrc: string | undefined;
  driveSecretUrl: string | undefined;
  onClose: () => void;
}) {
  const secretPhotoUrl = driveSecretUrl ? convertDriveLinkToDirectImage(driveSecretUrl) : null;
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
            className="glass-panel w-full max-w-sm overflow-hidden rounded-3xl text-center shadow-2xl"
          >
            {imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL or admin-supplied URL, not a local asset next/image can optimize.
              <img src={imageSrc} alt="" className="mb-4 h-48 w-full rounded-t-[24px] object-cover shadow-md md:h-64" />
            )}
            <div className={imageSrc ? "px-7 pb-7" : "p-7"}>
              <motion.div
                initial={{ scale: 0.5, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.7, delay: 0.1 }}
                className="text-5xl"
              >
                ✨
              </motion.div>
              <h3 className="mt-3 text-xl font-bold tracking-tight text-stone-800">Hidden Feature Unlocked!</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{note}</p>
              {secretPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- Admin-supplied Google Drive URL, not a local asset next/image can optimize.
                <img
                  src={secretPhotoUrl}
                  alt="Secret photo reward"
                  className="mt-4 w-full max-h-[60vh] rounded-xl object-contain shadow-lg"
                />
              )}
              <button
                onClick={onClose}
                type="button"
                className="mt-5 rounded-full bg-terracotta-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700"
              >
                Nice!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
