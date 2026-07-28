import { CATEGORY_COLOR, CATEGORY_ICON, type PlaceCategory } from "./categories";

export function createStepMarkerEl(
  index: number,
  category: PlaceCategory,
  active: boolean
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-marker" + (active ? " tg-marker-active" : "");
  el.style.background = CATEGORY_COLOR[category];
  el.innerHTML = `<span class="tg-marker-icon">${CATEGORY_ICON[category]}</span><span class="tg-marker-badge">${index}</span>`;
  return el;
}

export function createStartMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "tg-start-marker";
  el.innerHTML = "🏁";
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
