"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LatLng } from "@/lib/types";
import { CATEGORY_LABEL, type PlaceCategory } from "@/lib/categories";

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as PlaceCategory[];

export default function AddStopPinForm({
  point,
  onSave,
  onCancel,
}: {
  point: LatLng;
  onSave: (name: string, category: PlaceCategory) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("other");

  return (
    <AnimatePresence>
      <motion.form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave(name.trim(), category);
        }}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="glass-panel absolute right-4 top-32 z-10 w-80 rounded-2xl p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold tracking-tight text-stone-800">📍 New stop</h3>
        <p className="mt-0.5 text-[11px] text-stone-400">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Stop name"
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PlaceCategory)}
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-sm text-stone-900 focus:border-sage-400 focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-sage-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-sage-700 disabled:opacity-40"
          >
            Add stop
          </button>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}
