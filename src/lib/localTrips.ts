import type { Trip } from "./types";

const KEY = "touristguider:mytrips";
const LAST_KEY = "touristguider:lasttrip";
const SNAPSHOT_PREFIX = "touristguider:trip:";

export interface LocalTripEntry {
  id: string;
  title: string;
  updatedAt: number;
}

function readAll(): LocalTripEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalTripEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: LocalTripEntry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
}

export function getMyTrips(): LocalTripEntry[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function rememberTrip(id: string, title: string) {
  if (!id) return;
  const entries = readAll().filter((e) => e.id !== id);
  entries.push({ id, title, updatedAt: Date.now() });
  writeAll(entries);
  window.localStorage.setItem(LAST_KEY, id);
}

export function forgetTrip(id: string) {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function getLastTripId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(LAST_KEY);
  return id && id !== "undefined" && id !== "null" ? id : null;
}

/** Local-first backup of the actual itinerary content, mirrored on every
 *  change (see TripLoader) — the server autosave is debounced and can fail
 *  silently offline, so this is what a reload falls back to instead of
 *  losing whatever was just added/edited/reordered. */
export function saveTripSnapshot(trip: Trip) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_PREFIX + trip.id, JSON.stringify(trip));
  } catch {
    // localStorage can throw (quota exceeded, private browsing) — the
    // server save is still the source of truth, so a failed backup here
    // isn't fatal.
  }
}

export function loadTripSnapshot(id: string): Trip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_PREFIX + id);
    return raw ? (JSON.parse(raw) as Trip) : null;
  } catch {
    return null;
  }
}
