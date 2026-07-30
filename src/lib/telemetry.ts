export interface PlayerStats {
  hunger: number;
  thirst: number;
  catCount: number;
  fatigueLevel: number;
}

export interface PlayerTelemetry {
  playerId: string;
  playerName: string;
  lat: number | null;
  lng: number | null;
  stats: PlayerStats;
  timestamp: number;
}

export type GmAction = "full_heal" | "send_water" | "gift_cat" | "cure_fatigue";

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
};

export const GM_ACTION_MESSAGE: Record<GmAction, string> = {
  full_heal: "The Game Master fully healed you! ✨",
  send_water: "The Game Master sent you water! 💧",
  gift_cat: "The Game Master sent a mystical cat! 🐾 +1",
  cure_fatigue: "The Game Master cured your fatigue! 🌿",
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

export function setPlayerName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_NAME_KEY, name.trim() || "Traveler");
}
