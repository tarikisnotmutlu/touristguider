"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  hasSessionIdentity,
  getSessionId,
  setPlayerName,
  setSessionId,
  setSessionPassword,
  slugifySessionId,
} from "@/lib/session";
import { isNicknameTaken, verifySessionCredentials } from "@/lib/tripSync";
import LoadingSpinner from "./LoadingSpinner";

const noopSubscribe = () => () => {};

/**
 * The app's only public entry point ("/") — purely a password-gated lobby
 * form, nothing else renders here. This file NEVER creates a session: the
 * only Firestore call on submit is verifySessionCredentials, a plain read.
 * Session creation is 100% isolated to the Admin panel (lib/tripSync.ts's
 * createSession) — there is no fallback path here that writes a session
 * into existence if one isn't found.
 *
 * On success, credentials are saved to localStorage and the browser is
 * navigated to the dynamic /[sessionId] route, which independently
 * re-verifies that same localStorage identity before ever rendering the
 * game board (see app/[sessionId]/page.tsx) — so this form is a UX
 * convenience, not the actual security boundary.
 *
 * `alreadyHasIdentity` is read via useSyncExternalStore rather than an
 * effect + setState so the server snapshot always reports "no identity"
 * (the form never SSRs in for a returning visitor who's about to be
 * redirected) and the real client snapshot corrects it on hydration
 * without a flash.
 */
export default function LobbyForm() {
  const router = useRouter();
  const alreadyHasIdentity = useSyncExternalStore(noopSubscribe, hasSessionIdentity, () => true);
  const [name, setName] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorizedNotice, setUnauthorizedNotice] = useState(false);

  // Populated by the /[sessionId] route guard bouncing someone back here
  // after a direct-link/typed-URL attempt without a matching identity.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("error") !== "unauthorized") return;
    const timer = setTimeout(() => setUnauthorizedNotice(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // A returning visitor who already has a valid identity skips the form
  // entirely and is sent straight to their session.
  useEffect(() => {
    if (!alreadyHasIdentity) return;
    const sessionId = getSessionId();
    if (sessionId) router.replace(`/${sessionId}`);
  }, [alreadyHasIdentity, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifySessionId(sessionInput);
    const trimmedName = name.trim();
    if (!trimmedName || !slug) return;

    setError(null);
    setChecking(true);
    try {
      const credCheck = await verifySessionCredentials(slug, password);
      if (!credCheck.ok) {
        setError(
          credCheck.reason === "not_found"
            ? "This Session ID does not exist. Only the Admin can create new sessions."
            : "Incorrect password."
        );
        return;
      }
      const taken = await isNicknameTaken(slug, trimmedName);
      if (taken) {
        setError("This nickname is already taken in this session. Please choose another.");
        return;
      }
      setPlayerName(trimmedName);
      setSessionId(slug);
      setSessionPassword(password);
      router.push(`/${slug}`);
    } catch {
      setError("Couldn't reach the session — check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  if (alreadyHasIdentity) {
    return <LoadingSpinner label="Resuming your session…" />;
  }

  if (checking) {
    return <LoadingSpinner label="Joining session…" />;
  }

  return (
    <AnimatePresence>
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
            Enter your nickname, the session id, and its password.
          </p>
          {unauthorizedNotice && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Please enter your name to join the session.
            </p>
          )}
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
          <input
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            type="password"
            placeholder="Session password"
            maxLength={128}
            className="mt-2 w-full rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-center text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
          />
          {error && <p className="mt-2 text-xs font-bold text-terracotta-600">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || !slugifySessionId(sessionInput) || !password}
            className="mt-4 w-full rounded-full bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-sage-700 disabled:opacity-40"
          >
            Start Journey
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
