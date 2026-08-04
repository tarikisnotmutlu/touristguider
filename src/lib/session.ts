const SESSION_ID_KEY = "touristguider:sessionId";
const PLAYER_NAME_KEY = "touristguider:playerName";
const SESSION_PASSWORD_KEY = "touristguider:sessionPassword";

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

/** The session password entered at the lobby — kept alongside the other two
 *  identity pieces purely as a record of what was used to get in; nothing
 *  re-checks it against Firestore after the initial lobby login (see
 *  lib/tripSync.ts's verifySessionCredentials, which is the only place a
 *  password is ever validated). */
export function getSessionPassword(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_PASSWORD_KEY);
}

export function setSessionPassword(password: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_PASSWORD_KEY, password);
}

/** Both identity pieces present — the lobby form's "skip straight to my
 *  session" condition, and what the /[sessionId] route guard checks. */
export function hasSessionIdentity(): boolean {
  return hasPlayerName() && hasSessionId();
}

/** Forgets all locally-stored identity so the lobby form reappears on next
 *  render — lets someone leave their current nickname/session and rejoin
 *  under a different one without clearing browser storage by hand. */
export function clearSessionIdentity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_ID_KEY);
  window.localStorage.removeItem(PLAYER_NAME_KEY);
  window.localStorage.removeItem(SESSION_PASSWORD_KEY);
}
