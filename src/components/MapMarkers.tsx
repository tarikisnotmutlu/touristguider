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

/** Mutates an existing step marker element in place (index/category/active
 *  state/day color) instead of throwing it away — paired with
 *  createStepMarkerEl so MapView can keep reusing the same marker/DOM node
 *  across re-renders and only touch what actually changed. */
export function updateStepMarkerEl(
  el: HTMLDivElement,
  index: number,
  category: PlaceCategory,
  active: boolean,
  colorOverride?: string
): void {
  // classList.toggle, never a full className overwrite — maplibre-gl adds
  // its own `maplibregl-marker` class to this element right after creation
  // (that's what makes it `position: absolute` instead of sitting in normal
  // document flow), and a plain `el.className = "..."` assignment here would
  // silently wipe that class on every re-render, leaving every marker to
  // stack vertically in DOM order instead of at its projected map position.
  el.classList.toggle("tg-marker-active", active);
  el.style.borderColor = colorOverride ?? CATEGORY_COLOR[category];
  const icon = el.querySelector<HTMLSpanElement>(".tg-marker-icon");
  const badge = el.querySelector<HTMLSpanElement>(".tg-marker-badge");
  if (icon) icon.textContent = CATEGORY_ICON[category];
  if (badge) badge.textContent = String(index);
}

// Must match .tg-start-marker's own border-color in globals.css — the
// update function (unlike the create function) has to be able to
// explicitly restore this default on an element that previously had an
// inline override color (e.g. leaving Overview mode).
const START_MARKER_DEFAULT_BORDER = "rgba(41, 37, 36, 0.55)";

export function createStartMarkerEl(colorOverride?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-start-marker";
  el.textContent = "🕛";
  if (colorOverride) el.style.borderColor = colorOverride;
  return el;
}

export function updateStartMarkerEl(el: HTMLDivElement, colorOverride?: string): void {
  el.style.borderColor = colorOverride ?? START_MARKER_DEFAULT_BORDER;
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
