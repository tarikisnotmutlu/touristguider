export interface PlayerStats {
  hunger: number;
  thirst: number;
  catCount: number;
  fatigueLevel: number;
}

/** Firestore document shape at sessions/{sessionId}/players/{playerName} —
 *  playerName IS the document id, so it isn't duplicated in the body. */
export interface PlayerTelemetry {
  lat: number | null;
  lng: number | null;
  stats: PlayerStats;
  timestamp: number;
}

/** PlayerTelemetry plus the playerName the admin UI read it back under —
 *  the document id isn't part of the document body, so callers that listed
 *  a whole players collection need to carry it alongside separately. */
export interface NamedPlayerTelemetry extends PlayerTelemetry {
  playerName: string;
}

export type GmAction = "full_heal" | "send_water" | "gift_cat" | "cure_fatigue" | "reset_stats";

/** Firestore document shape at .../players/{playerName}/overrides/{id}. */
export interface GmOverride {
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
