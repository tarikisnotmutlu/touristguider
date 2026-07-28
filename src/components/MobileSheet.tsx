"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useDragControls, animate, type PanInfo } from "framer-motion";
import PanelContent from "./PanelContent";

/** Fractions of viewport height that stay visible at each snap position. */
const SNAP_FRACTIONS = [0.15, 0.55, 0.92];
const FULL_FRACTION = SNAP_FRACTIONS[SNAP_FRACTIONS.length - 1];
const SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;
const VELOCITY_THRESHOLD = 500;

/** Swipeable bottom sheet for mobile, Flighty-style — spring physics, drag from
 *  the handle only (the content has its own touch interactions — drag-to-reorder
 *  stops, scrolling — that would otherwise fight with a whole-panel drag). */
export default function MobileSheet() {
  const [viewportH, setViewportH] = useState(0);
  const [snapIndex, setSnapIndex] = useState(1);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  useEffect(() => {
    function measure() {
      setViewportH(window.innerHeight);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const sheetHeight = viewportH * FULL_FRACTION;
  // Recomputed every render (cheap — 3 multiplications) instead of cached in a
  // ref, so dragConstraints/onDragEnd always see a value consistent with the
  // render that produced them — a ref populated in a separate effect would lag
  // a render behind on first mount and lock the sheet at {top:0, bottom:0}.
  const snapYValues = SNAP_FRACTIONS.map((f) => sheetHeight - f * viewportH);

  useEffect(() => {
    if (!viewportH) return;
    animate(y, snapYValues[snapIndex], SPRING);
    // Re-run only when the viewport size actually changes; snapIndex changes
    // are already handled by the drag-end handler animating `y` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportH]);

  function handleDragEnd(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const current = y.get();
    const velocity = info.velocity.y;

    let nextIndex: number;
    if (velocity > VELOCITY_THRESHOLD) {
      nextIndex = Math.max(0, snapIndex - 1); // fast swipe down -> reveal more
    } else if (velocity < -VELOCITY_THRESHOLD) {
      nextIndex = Math.min(SNAP_FRACTIONS.length - 1, snapIndex + 1); // fast swipe up -> expand
    } else {
      nextIndex = snapYValues.reduce(
        (closest, targetY, i) =>
          Math.abs(current - targetY) < Math.abs(current - snapYValues[closest]) ? i : closest,
        0
      );
    }

    setSnapIndex(nextIndex);
    animate(y, snapYValues[nextIndex], SPRING);
  }

  if (!viewportH) return null;

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: snapYValues[snapYValues.length - 1], bottom: snapYValues[0] }}
      dragElastic={0.08}
      onDragEnd={handleDragEnd}
      style={{ y, height: sheetHeight }}
      className="glass-panel fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl shadow-[0_-8px_32px_rgba(41,37,36,0.18)] lg:hidden"
    >
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
      >
        <div className="h-1.5 w-10 rounded-full bg-stone-300" />
      </div>
      <div className="min-h-0 flex-1">
        <PanelContent />
      </div>
    </motion.div>
  );
}
