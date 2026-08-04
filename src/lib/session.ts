const SESSION_ID_KEY = "touristguider:sessionId";
const PLAYER_NAME_KEY = "touristguider:playerName";

/** A Firestore document id — mirrors the sessionId charset used for the
 *  `sessions/{sessionId}` path everywhere else in the app. */
export function slugifySessionId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The session ("lobby") this browser is currently joined to — entered once
 *  via the onboarding gate and remembered locally. Not "core data": it's
 *  just a pointer to which sessions/{sessionId} document tree everything
 *  else in the app reads from. */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(SESSION_ID_KEY);
  return id && id.trim() ? id : null;
}

export function setSessionId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_ID_KEY, id.trim());
}

export function hasSessionId(): boolean {
  return !!getSessionId();
}

export function getPlayerName(): string | null {
  if (typeof window === "undefined") return null;
  const name = window.localStorage.getItem(PLAYER_NAME_KEY);
  return name && name.trim() ? name : null;
}

export function setPlayerName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_NAME_KEY, name.trim());
}

export function hasPlayerName(): boolean {
  return !!getPlayerName();
}

/** Both identity pieces present — the onboarding gate's unlock condition. */
export function hasSessionIdentity(): boolean {
  return hasPlayerName() && hasSessionId();
}

/** Forgets both identity pieces so the onboarding gate reappears on next
 *  render — lets someone leave their current nickname/session and rejoin
 *  under a different one without clearing browser storage by hand. */
export function clearSessionIdentity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_ID_KEY);
  window.localStorage.removeItem(PLAYER_NAME_KEY);
}
