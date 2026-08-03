"use client";

import { useState } from "react";
import { parseLatLngPaste } from "@/lib/geo";

/** Edit-mode-only manual entry for a stop that isn't in the search index —
 *  a name plus a single pasted "Lat, Lng" coordinate pair (e.g.
 *  "41.014568, 28.974133"), no category inference needed. Adding a stop
 *  never happens via a map click (see MapView) — this and the search box
 *  above it are the only two ways to add one. */
export default function AddCustomStopForm({
  onAdd,
}: {
  onAdd: (name: string, lat: number, lng: number) => void;
}) {
  const [name, setName] = useState("");
  const [coords, setCoords] = useState("");

  const parsed = parseLatLngPaste(coords);
  const canAdd = name.trim().length > 0 && parsed !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd || !parsed) return;
    onAdd(name.trim(), parsed.lat, parsed.lng);
    setName("");
    setCoords("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Or add by coordinates</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Location name"
        className="w-full rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
      />
      <div className="flex gap-1.5">
        <input
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          placeholder="Lat, Lng — e.g. 41.014568, 28.974133"
          className="w-full rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="shrink-0 rounded-full bg-sage-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );
}
