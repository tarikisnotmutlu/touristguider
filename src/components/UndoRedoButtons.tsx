"use client";

import { useEffect } from "react";
import { useTripStore } from "@/store/useTripStore";

export default function UndoRedoButtons() {
  const canUndo = useTripStore((s) => s.past.length > 0);
  const canRedo = useTripStore((s) => s.future.length > 0);
  const undo = useTripStore((s) => s.undo);
  const redo = useTripStore((s) => s.redo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={undo}
        disabled={!canUndo}
        type="button"
        title="Undo (Ctrl/Cmd+Z)"
        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-30"
      >
        ↩️
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        type="button"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-30"
      >
        ↪️
      </button>
    </div>
  );
}
