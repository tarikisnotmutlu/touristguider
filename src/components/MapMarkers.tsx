import { CATEGORY_COLOR, CATEGORY_ICON, type PlaceCategory } from "@/lib/categories";

/**
 * Vanilla-DOM marker builders for raw maplibre-gl (no react-map-gl wrapper).
 * Each returns a plain HTMLElement handed straight to `new maplibregl.Marker({
 * element })` — the CSS classes below (`.tg-marker`, `.tg-start-marker`, etc.)
 * are unchanged from the old React-component versions, so the visual result
 * is identical.
 */

export function createStepMarkerEl(
  index: number,
  category: PlaceCategory,
  active: boolean,
  colorOverride?: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-marker" + (active ? " tg-marker-active" : "");
  el.style.borderColor = colorOverride ?? CATEGORY_COLOR[category];
  el.innerHTML = `<span class="tg-marker-icon">${CATEGORY_ICON[category]}</span><span class="tg-marker-badge">${index}</span>`;
  return el;
}

export function createStartMarkerEl(colorOverride?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-start-marker";
  el.textContent = "🕛";
  if (colorOverride) el.style.borderColor = colorOverride;
  return el;
}

export function createViaMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-via-marker";
  return el;
}

export function createGhostMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-ghost-marker";
  return el;
}

export function createGemMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-gem-marker";
  el.textContent = "✨";
  return el;
}

export function createLiveLocationMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "relative flex h-4 w-4 items-center justify-center";
  const ping = document.createElement("span");
  ping.className = "absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75";
  const dot = document.createElement("span");
  dot.className = "relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500";
  dot.style.boxShadow = "0 0 0 2px rgba(14,165,233,0.4)";
  el.appendChild(ping);
  el.appendChild(dot);
  return el;
}
