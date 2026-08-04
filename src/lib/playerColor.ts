/** Vibrant, high-contrast-on-basemap palette for telling players apart at a
 *  glance on the Admin map/player cards — deliberately avoids the app's own
 *  terracotta/sage brand colors so a player dot never reads as UI chrome. */
const PLAYER_COLOR_PALETTE = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#9333ea", // purple
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
] as const;

/** Deterministic per-player color: same playerName always resolves to the
 *  same palette entry, so it doesn't need to be "assigned" once and
 *  remembered anywhere — every write (or a legacy doc missing the field)
 *  recomputes the identical color from the name alone. */
export function playerColor(playerName: string): string {
  let hash = 0;
  for (let i = 0; i < playerName.length; i++) {
    hash = (hash * 31 + playerName.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PLAYER_COLOR_PALETTE.length;
  return PLAYER_COLOR_PALETTE[index];
}
