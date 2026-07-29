"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PanelContent from "./PanelContent";

const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;
const COLLAPSED_HEIGHT = "35vh";
const EXPANDED_HEIGHT = "85vh";

/** Bottom sheet for mobile. No dragging — tapping the handle toggles between a
 *  collapsed peek (tabs + first place) and a near-full expanded view. */
export default function MobileSheet() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      animate={{ height: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
      transition={SPRING}
      className="glass-panel fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl shadow-[0_-8px_32px_rgba(41,37,36,0.18)] lg:hidden"
    >
      <button
        onClick={() => setIsExpanded((v) => !v)}
        type="button"
        aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
        className="flex shrink-0 justify-center py-2.5"
      >
        <div className="h-1.5 w-10 rounded-full bg-stone-300" />
      </button>
      <div className="min-h-0 flex-1">
        <PanelContent />
      </div>
    </motion.div>
  );
}
