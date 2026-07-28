"use client";

import { CATEGORY_COLOR, CATEGORY_ICON, type PlaceCategory } from "@/lib/categories";

export function StepMarker({
  index,
  category,
  active,
}: {
  index: number;
  category: PlaceCategory;
  active: boolean;
}) {
  return (
    <div
      className={"tg-marker" + (active ? " tg-marker-active" : "")}
      style={{ background: CATEGORY_COLOR[category] }}
    >
      <span className="tg-marker-icon">{CATEGORY_ICON[category]}</span>
      <span className="tg-marker-badge">{index}</span>
    </div>
  );
}

export function StartMarker() {
  return <div className="tg-start-marker">🏁</div>;
}

export function ViaMarker() {
  return <div className="tg-via-marker" />;
}

export function GhostMarker() {
  return <div className="tg-ghost-marker" />;
}

export function GemMarker() {
  return <div className="tg-gem-marker">💎</div>;
}

export function LiveLocationMarker() {
  return (
    <div className="relative flex h-4 w-4 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
      <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.4)]" />
    </div>
  );
}
