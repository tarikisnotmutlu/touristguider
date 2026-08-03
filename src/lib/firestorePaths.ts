import { collection, doc } from "firebase/firestore";
import { getDb } from "./firebase";

/**
 * Firestore schema (everything scoped under one session id):
 *   sessions/{sessionId}                              — title, dayOrder[], unplanned[]
 *   sessions/{sessionId}/itinerary/{dayId}             — one Day per document
 *   sessions/{sessionId}/gems/{gemId}                  — one HiddenGem per document
 *   sessions/{sessionId}/players/{playerName}          — live location + RPG stats
 *   sessions/{sessionId}/players/{playerName}/overrides/{id} — queued GM actions
 */

export function sessionsCollection() {
  return collection(getDb(), "sessions");
}

export function sessionDocRef(sessionId: string) {
  return doc(getDb(), "sessions", sessionId);
}

export function itineraryCollection(sessionId: string) {
  return collection(getDb(), "sessions", sessionId, "itinerary");
}

export function dayDocRef(sessionId: string, dayId: string) {
  return doc(getDb(), "sessions", sessionId, "itinerary", dayId);
}

export function gemsCollection(sessionId: string) {
  return collection(getDb(), "sessions", sessionId, "gems");
}

export function gemDocRef(sessionId: string, gemId: string) {
  return doc(getDb(), "sessions", sessionId, "gems", gemId);
}

/** Firestore doc ids can't contain "/" and can't be exactly "." or ".." —
 *  playerName is free-form user text, so it needs sanitizing before it's
 *  usable as a path segment. */
function safePlayerName(playerName: string): string {
  const safe = playerName.trim().replace(/\//g, "-");
  return safe === "." || safe === ".." || !safe ? "traveler" : safe;
}

export function playersCollection(sessionId: string) {
  return collection(getDb(), "sessions", sessionId, "players");
}

export function playerDocRef(sessionId: string, playerName: string) {
  return doc(getDb(), "sessions", sessionId, "players", safePlayerName(playerName));
}

export function playerOverridesCollection(sessionId: string, playerName: string) {
  return collection(getDb(), "sessions", sessionId, "players", safePlayerName(playerName), "overrides");
}

export function playerOverrideDocRef(sessionId: string, playerName: string, overrideId: string) {
  return doc(getDb(), "sessions", sessionId, "players", safePlayerName(playerName), "overrides", overrideId);
}
