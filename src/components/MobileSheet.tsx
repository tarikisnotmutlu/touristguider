"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      animate={{ height: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
      transition={SPRING}
      className="glass-panel fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-3xl shadow-[0_-8px_32px_rgba(41,37,36,0.18)] lg:hidden"
    >
      <button
        onClick={() => setIsExpanded((v) => !v)}
        type="button"
        aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
        className="flex shrink-0 justify-center py-2.5"
      >
        <div className="h-1.5 w-10 rounded-full bg-stone-300" />
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelContent />
      </div>
    </motion.div>
  );
}
