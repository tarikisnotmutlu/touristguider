"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import PanelContent from "./PanelContent";

const SNAP_POINTS = [0.15, 0.55, 0.92];

/** Swipeable bottom sheet for mobile — non-modal so the map stays interactive
 *  underneath, non-dismissible so it can't be swiped away entirely (there's
 *  always at least a peek strip showing the current day). */
export default function MobileSheet() {
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1]);

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      // Only the handle bar drags the sheet — the content area has its own
      // touch-driven interactions (drag-to-reorder stops, scrolling) that would
      // otherwise fight with vaul's whole-panel drag detection.
      handleOnly
    >
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 flex h-[92vh] flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.15)] outline-none md:hidden">
          <Drawer.Title className="sr-only">Itinerary</Drawer.Title>
          <div className="flex shrink-0 justify-center py-2">
            <Drawer.Handle className="h-1.5 w-10 rounded-full bg-slate-300" />
          </div>
          <div className="min-h-0 flex-1">
            <PanelContent />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
