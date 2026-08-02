export interface PlayerStats {
  hunger: number;
  thirst: number;
  catCount: number;
  fatigueLevel: number;
}

export interface PlayerTelemetry {
  playerId: string;
  /** Which trip this player is currently on — the admin dashboard is scoped
   *  per-trip, so this is how it knows which players to show. */
  tripId: string;
  playerName: string;
  lat: number | null;
  lng: number | null;
  stats: PlayerStats;
  timestamp: number;
}

export type GmAction = "full_heal" | "send_water" | "gift_cat" | "cure_fatigue" | "reset_stats";

export interface GmOverride {
  id: string;
  action: GmAction;
  createdAt: number;
}

export const GM_ACTION_LABEL: Record<GmAction, string> = {
  full_heal: "Full Heal",
  send_water: "Send Water",
  gift_cat: "Gift a Cat (+1)",
  cure_fatigue: "Cure Fatigue",
  reset_stats: "Reset Stats",
};

export const GM_ACTION_MESSAGE: Record<GmAction, string> = {
  full_heal: "The Game Master fully healed you! ✨",
  send_water: "The Game Master sent you water! 💧",
  gift_cat: "The Game Master sent a mystical cat! 🐾 +1",
  cure_fatigue: "The Game Master cured your fatigue! 🌿",
  reset_stats: "The Game Master reset your stats! 🔄",
};

const PLAYER_ID_KEY = "touristguider:playerId";
const PLAYER_NAME_KEY = "touristguider:playerName";

/** A stable per-browser identity for telemetry — generated once and kept in
 *  localStorage, independent of any particular trip. */
export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  if (typeof window === "undefined") return "Traveler";
  return window.localStorage.getItem(PLAYER_NAME_KEY) || "Traveler";
}

/** Distinguishes "never set" from "set to the Traveler fallback" —
 *  getPlayerName() alone can't tell those apart, but the onboarding gate
 *  needs to. */
export function hasPlayerName(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(PLAYER_NAME_KEY)?.trim();
}

export function setPlayerName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_NAME_KEY, name.trim() || "Traveler");
}
