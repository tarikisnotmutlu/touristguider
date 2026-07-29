"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LatLng } from "@/lib/types";

export default function HiddenGemCreateForm({
  point,
  onSave,
  onCancel,
}: {
  point: LatLng;
  onSave: (note: string, geoLocked: boolean) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [geoLocked, setGeoLocked] = useState(true);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="glass-panel absolute right-4 top-32 z-10 w-80 rounded-2xl p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold tracking-tight text-stone-800">✨ New hidden gem</h3>
        <p className="mt-0.5 text-[11px] text-stone-400">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Write the secret note only unlocked within 20m…"
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white/80 p-2 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
        />
        <label className="mt-2.5 flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={geoLocked}
            onChange={(e) => setGeoLocked(e.target.checked)}
            className="accent-terracotta-600"
          />
          🔒 Geo-Lock — require being nearby to unlock
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            onClick={() => note.trim() && onSave(note, geoLocked)}
            type="button"
            disabled={!note.trim()}
            className="rounded-full bg-terracotta-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700 disabled:opacity-40"
          >
            Save gem
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
