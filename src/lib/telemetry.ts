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
  /** Deterministic per-player hex color (see lib/playerColor.ts) — persisted
   *  so the admin UI can read it straight off the doc without recomputing,
   *  though it's safe to recompute client-side for any doc missing it. */
  color?: string;
}

/** PlayerTelemetry plus the playerName the admin UI read it back under —
 *  the document id isn't part of the document body, so callers that listed
 *  a whole players collection need to carry it alongside separately. */
export interface NamedPlayerTelemetry extends PlayerTelemetry {
  playerName: string;
}

export type GmAction = "full_heal" | "send_water" | "gift_cat" | "cure_fatigue" | "reset_stats" | "message";

/** Firestore document shape at .../players/{playerName}/overrides/{id}.
 *  `text` is only set (and only meaningful) for the "message" action — a
 *  free-form note from the Admin, shown via the same GmToast every
 *  other override uses, delivered to that one player's own overrides
 *  subcollection and nobody else's. */
export interface GmOverride {
  action: GmAction;
  createdAt: number;
  text?: string;
}

export const GM_ACTION_LABEL: Record<GmAction, string> = {
  full_heal: "Full Heal",
  send_water: "Send Water",
  gift_cat: "Gift a Cat (+1)",
  cure_fatigue: "Cure Fatigue",
  reset_stats: "Reset Stats",
  message: "Message",
};

// "message" deliberately has no static entry here — its text comes from the
// override's own `text` field (set per-send by the Admin), not a
// fixed string like every other action.
export const GM_ACTION_MESSAGE: Record<Exclude<GmAction, "message">, string> = {
  full_heal: "The Admin fully healed you! ✨",
  send_water: "The Admin sent you water! 💧",
  gift_cat: "The Admin sent a mystical cat! 🐾 +1",
  cure_fatigue: "The Admin cured your fatigue! 🌿",
  reset_stats: "The Admin reset your stats! 🔄",
};
