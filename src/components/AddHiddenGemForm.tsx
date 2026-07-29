"use client";

import { useState } from "react";

/** Edit-mode-only explicit entry point for creating a Hidden Gem by
 *  coordinates — the map-click flow (MapView's "Drop Hidden Gem" button) is
 *  desktop-only and easy to miss, so this gives every screen size a direct,
 *  discoverable way to add one right next to the custom-stop form. */
export default function AddHiddenGemForm({
  onAdd,
}: {
  onAdd: (point: { lat: number; lng: number }, note: string, geoLocked: boolean, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [note, setNote] = useState("");
  const [geoLocked, setGeoLocked] = useState(true);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const canAdd =
    note.trim().length > 0 && lat.trim() !== "" && lng.trim() !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  function reset() {
    setName("");
    setLat("");
    setLng("");
    setNote("");
    setGeoLocked(true);
    setExpanded(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    onAdd({ lat: latNum, lng: lngNum }, note, geoLocked, name);
    reset();
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-terracotta-300 bg-terracotta-50/60 px-3.5 py-2 text-sm font-medium text-terracotta-700 transition-colors hover:border-terracotta-400 hover:bg-terracotta-50"
      >
        ✨ Add Hidden Gem
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-1.5 rounded-2xl border border-terracotta-200 bg-terracotta-50/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-terracotta-600">✨ New hidden gem</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Location name (optional, for your reference only)"
        className="w-full rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
      />
      <div className="flex gap-1.5">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          type="number"
          step="any"
          placeholder="Latitude"
          className="w-1/2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          type="number"
          step="any"
          placeholder="Longitude"
          className="w-1/2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Secret note, only unlocked within 20m…"
        className="w-full rounded-xl border border-stone-200 bg-white/80 p-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
      />
      <label className="flex items-center gap-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={geoLocked}
          onChange={(e) => setGeoLocked(e.target.checked)}
          className="accent-terracotta-600"
        />
        🔒 Geo-Lock — require being nearby to unlock
      </label>
      <div className="mt-1 flex justify-end gap-2">
        <button
          onClick={reset}
          type="button"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-full bg-terracotta-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700 disabled:opacity-40"
        >
          Save gem
        </button>
      </div>
    </form>
  );
}
