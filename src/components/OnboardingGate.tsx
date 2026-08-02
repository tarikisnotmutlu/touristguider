"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { hasPlayerName, setPlayerName } from "@/lib/telemetry";

const noopSubscribe = () => () => {};

/** Blocks the whole player experience behind an unclosable nickname prompt
 *  on first visit — no backdrop-click or Escape dismissal, since telemetry
 *  and Game Master player cards are meaningless without a name. Renders
 *  `children` underneath from the start (rather than delaying mount) so the
 *  map/trip are already warm the moment the nickname is submitted.
 *
 *  localStorage is read via useSyncExternalStore rather than an effect +
 *  setState — the server snapshot always reports "has a name" so the modal
 *  never SSRs in for a returning visitor, and the real client snapshot
 *  (read during hydration) corrects it without a hydration-mismatch flash. */
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const alreadyHasName = useSyncExternalStore(noopSubscribe, hasPlayerName, () => true);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [name, setName] = useState("");
  const needsName = !alreadyHasName && !justSubmitted;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPlayerName(name);
    setJustSubmitted(true);
  }

  return (
    <>
      {children}
      <AnimatePresence>
        {needsName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-md"
          >
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
              className="glass-panel w-full max-w-sm rounded-3xl p-7 text-center shadow-2xl"
            >
              <div className="text-4xl">🧭</div>
              <h2 className="mt-3 text-lg font-bold tracking-tight text-stone-800">Welcome, traveler!</h2>
              <p className="mt-1 text-sm text-stone-500">Enter your nickname to start the journey.</p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your nickname"
                maxLength={24}
                className="mt-4 w-full rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-center text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="mt-4 w-full rounded-full bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-sage-700 disabled:opacity-40"
              >
                Start Journey
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
