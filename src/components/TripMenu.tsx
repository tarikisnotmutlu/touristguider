"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { setSessionId, slugifySessionId } from "@/lib/session";

/** Session-aware replacement for the old per-trip "My trips" menu — there's
 *  no longer a URL to bookmark, just a session id shared verbally/by text
 *  within the group, so this exposes it and lets the player switch to a
 *  different one (a fresh page load re-runs the onboarding/session-resolve
 *  flow against the new id). */
export default function TripMenu() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [newSessionInput, setNewSessionInput] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const currentSessionId = useTripStore((s) => s.trip.id);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSwitching(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleSwitch(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifySessionId(newSessionInput);
    if (!slug) return;
    setSessionId(slug);
    window.location.reload();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
        title="Session"
      >
        📂
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="glass-panel absolute right-0 z-30 mt-1.5 w-64 rounded-2xl p-3 shadow-xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Session id</p>
            <p className="mt-1 truncate rounded-lg bg-stone-100 px-2.5 py-1.5 text-sm font-medium text-stone-700">
              {currentSessionId}
            </p>
            <p className="mt-1.5 text-[11px] text-stone-400">
              Share this id with your group — they enter it on the join screen.
            </p>

            <div className="mt-3 border-t border-stone-200/70 pt-2">
              {switching ? (
                <form onSubmit={handleSwitch} className="flex flex-col gap-1.5">
                  <input
                    autoFocus
                    value={newSessionInput}
                    onChange={(e) => setNewSessionInput(e.target.value)}
                    placeholder="New session id"
                    className="w-full rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-xs text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newSessionInput.trim()}
                    className="rounded-full bg-stone-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Switch
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setSwitching(true)}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-stone-700 hover:bg-sage-50"
                >
                  🔀 Switch session
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
