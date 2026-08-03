"use client";

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  hasSessionIdentity,
  getSessionId,
  setPlayerName,
  setSessionId,
  slugifySessionId,
} from "@/lib/session";
import { isNicknameTaken } from "@/lib/tripSync";
import TripLoader from "./TripLoader";
import LoadingSpinner from "./LoadingSpinner";

const noopSubscribe = () => () => {};

/** Blocks the entire app — no map, no data, nothing — behind an unclosable
 *  lobby prompt until BOTH a nickname and a session id are entered, and the
 *  nickname is confirmed free within that session. Nothing downstream
 *  (TripLoader, Firestore reads, telemetry) is mounted until all of that
 *  clears, since every one of them needs a sessionId to scope to.
 *
 *  `justSubmitted` is real React state, not a side-channel — the instant it
 *  flips true the component re-renders and mounts TripLoader with whatever
 *  sessionId was just written, no reload required. localStorage itself is
 *  read via useSyncExternalStore rather than an effect + setState — the
 *  server snapshot always reports "unlocked" so the modal never SSRs in for
 *  a returning visitor, and the real client snapshot (read during
 *  hydration) corrects it without a hydration-mismatch flash. */
export default function OnboardingGate() {
  const alreadyHasIdentity = useSyncExternalStore(noopSubscribe, hasSessionIdentity, () => true);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsIdentity = !alreadyHasIdentity && !justSubmitted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifySessionId(sessionInput);
    const trimmedName = name.trim();
    if (!trimmedName || !slug) return;

    setError(null);
    setChecking(true);
    try {
      const taken = await isNicknameTaken(slug, trimmedName);
      if (taken) {
        setError("This nickname is already taken in this session. Please choose another.");
        return;
      }
      setPlayerName(trimmedName);
      setSessionId(slug);
      setJustSubmitted(true);
    } catch {
      setError("Couldn't reach the session — check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  if (checking) {
    return <LoadingSpinner label="Joining session…" />;
  }

  if (!needsIdentity) {
    const sessionId = getSessionId();
    return sessionId ? <TripLoader sessionId={sessionId} /> : null;
  }

  return (
    <AnimatePresence>
      {needsIdentity && (
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
            <h2 className="mt-3 text-lg font-bold tracking-tight text-stone-800">Join a trip</h2>
            <p className="mt-1 text-sm text-stone-500">
              Enter your nickname and the session id your group is using.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Your nickname"
              maxLength={24}
              className="mt-4 w-full rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-center text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
            />
            <input
              value={sessionInput}
              onChange={(e) => {
                setSessionInput(e.target.value);
                setError(null);
              }}
              placeholder="Session id"
              maxLength={64}
              className="mt-2 w-full rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-center text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-terracotta-600">{error}</p>}
            <button
              type="submit"
              disabled={!name.trim() || !slugifySessionId(sessionInput)}
              className="mt-4 w-full rounded-full bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-sage-700 disabled:opacity-40"
            >
              Start Journey
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
