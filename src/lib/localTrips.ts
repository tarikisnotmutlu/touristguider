const KEY = "touristguider:mytrips";
const LAST_KEY = "touristguider:lasttrip";

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
