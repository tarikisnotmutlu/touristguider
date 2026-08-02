"use client";

import { motion } from "framer-motion";
import { useJourneyStore } from "@/store/useJourneyStore";
import PanelContent from "./PanelContent";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;
// Collapsed to just the handle (+ a sliver of the header behind it) so the
// map underneath is almost fully visible — the previous 35vh peek still hid
// most of the map behind the destination card and day tabs.
const COLLAPSED_HEIGHT = "90px";
const EXPANDED_HEIGHT = "85vh";

/** Bottom sheet for mobile. No dragging — tapping the handle toggles between a
 *  near-full expanded view and a collapsed sliver that leaves the map visible. */
export default function MobileSheet() {
  const isExpanded = useJourneyStore((s) => s.sheetExpanded);
  const setSheetExpanded = useJourneyStore((s) => s.setSheetExpanded);

  return (
    <motion.div
      animate={{ height: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
      transition={SPRING}
      className="glass-panel fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-3xl shadow-[0_-8px_32px_rgba(41,37,36,0.18)] lg:hidden"
    >
      <button
        onClick={() => setSheetExpanded(!isExpanded)}
        type="button"
        aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
        className="flex shrink-0 items-center justify-center py-2.5 opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-stone-300 stroke-2"
          style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.3s ease" }}
        >
          <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelContent respectSheetCollapse />
      </div>
    </motion.div>
  );
}
