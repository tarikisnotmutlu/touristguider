"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTripStore } from "@/store/useTripStore";
import { clearSessionIdentity, getPlayerName } from "@/lib/session";

/** Session-aware replacement for the old per-trip "My trips" menu — there's
 *  no longer a URL to bookmark, just a session id shared verbally/by text
 *  within the group, so this exposes it. Leaving (whether to switch to a
 *  different session or just pick a new nickname) always routes back
 *  through the password-gated lobby at "/" rather than reloading straight
 *  into a new session — the player app has no path that can validate a
 *  session id/password itself, that's the lobby's job alone. */
export default function TripMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentSessionId = useTripStore((s) => s.trip.id);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleLeave() {
    if (!confirm("Leave this session? You'll be able to rejoin with a new nickname, session id, and password.")) return;
    clearSessionIdentity();
    router.push("/");
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
              <button
                onClick={handleLeave}
                type="button"
                title="Leave this session and rejoin through the lobby"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-terracotta-600 hover:bg-terracotta-50"
              >
                🚪 Leave — switch session or nickname{getPlayerName() ? ` (currently ${getPlayerName()})` : ""}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
