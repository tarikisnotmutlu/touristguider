import type { TransportMode } from "./types";

export const TRANSPORT_ICON: Record<TransportMode, string> = {
  walk: "🚶‍♂️",
  drive: "🚗",
  metro: "🚇",
  bus: "🚌",
  ferry: "⛴️",
  cycle: "🚲",
};

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  walk: "Walking",
  drive: "Driving",
  metro: "Metro",
  bus: "Bus",
  ferry: "Ferry",
  cycle: "Cycling",
};

export const TRANSPORT_COLOR: Record<TransportMode, string> = {
  walk: "#2563eb",
  drive: "#dc2626",
  metro: "#7c3aed",
  bus: "#ea580c",
  ferry: "#0891b2",
  cycle: "#16a34a",
};

export const TRANSPORT_MODES: TransportMode[] = ["walk", "cycle", "drive", "bus", "metro", "ferry"];
