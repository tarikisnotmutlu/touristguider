"use client";

import { motion } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";

export default function StartDayButton() {
  const dayStarted = useJourneyStore((s) => s.dayStarted);
  const startDay = useJourneyStore((s) => s.startDay);
  const stopDay = useJourneyStore((s) => s.stopDay);
  const liveLocation = useJourneyStore((s) => s.liveLocation);
  const locationPermissionDenied = useJourneyStore((s) => s.locationPermissionDenied);

  return (
    <motion.button
      onClick={dayStarted ? stopDay : startDay}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
      type="button"
      className={
        "mx-3 my-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors " +
        (dayStarted
          ? "bg-sage-100 text-sage-700 hover:bg-sage-200"
          : "bg-sage-600 text-white hover:bg-sage-700")
      }
    >
      {dayStarted ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-600" />
          </span>
          {liveLocation
            ? "Live tracking — tap to end day"
            : locationPermissionDenied
              ? "Location blocked — enable it in your phone's settings"
              : "Waiting for location…"}
        </>
      ) : (
        <>▶ Start Day</>
      )}
    </motion.button>
  );
}
