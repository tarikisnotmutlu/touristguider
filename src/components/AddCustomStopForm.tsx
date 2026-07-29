"use client";

import { useState } from "react";

/** Edit-mode-only manual entry for a stop that isn't in the search index —
 *  just a name plus raw coordinates, no category inference needed. */
export default function AddCustomStopForm({
  onAdd,
}: {
  onAdd: (name: string, lat: number, lng: number) => void;
}) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const canAdd = name.trim().length > 0 && lat.trim() !== "" && lng.trim() !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    onAdd(name.trim(), latNum, lngNum);
    setName("");
    setLat("");
    setLng("");
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
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          type="number"
          step="any"
          placeholder="Latitude"
          className="w-1/2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          type="number"
          step="any"
          placeholder="Longitude"
          className="w-1/2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
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
