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
