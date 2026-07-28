import type { TransportMode } from "./types";

export const TRANSPORT_ICON: Record<TransportMode, string> = {
  walk: "🚶‍♂️",
  drive: "🚗",
  transit: "🚇",
  ferry: "⛴️",
};

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  walk: "Walking",
  drive: "Driving",
  transit: "Public Transit",
  ferry: "Ferry",
};

export const TRANSPORT_COLOR: Record<TransportMode, string> = {
  walk: "#566d4a",
  drive: "#9d4826",
  transit: "#6b5b7a",
  ferry: "#3f7a82",
};

export const TRANSPORT_MODES: TransportMode[] = ["walk", "drive", "transit", "ferry"];

/** Maps any legacy mode value (from trips saved before modes were simplified)
 *  onto the current 4-mode set, so old persisted/shared trips still load cleanly. */
export function normalizeTransportMode(mode: string): TransportMode {
  if (mode === "walk" || mode === "drive" || mode === "transit" || mode === "ferry") return mode;
  if (mode === "metro" || mode === "bus") return "transit";
  if (mode === "cycle") return "walk";
  return "walk";
}
