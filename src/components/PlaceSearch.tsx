"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_ICON, inferCategoryFromNominatim, type PlaceCategory } from "@/lib/categories";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
}

interface PlaceSearchProps {
  placeholder?: string;
  onSelect: (place: {
    name: string;
    lat: number;
    lng: number;
    category?: PlaceCategory;
  }) => void;
}

// Soft bias toward Istanbul (left,top,right,bottom) — a strictly free Nominatim
// param, no API key. `bounded=0` keeps it a *preference* rather than a hard
// restriction, so a search still works if you're planning a day trip out of town.
const ISTANBUL_VIEWBOX = "28.45,41.25,29.45,40.80";

/**
 * Free-tier autocomplete against Nominatim's public search API — no API key,
 * no credit card. For heavier production traffic Nominatim's usage policy asks
 * for a proxy with a proper User-Agent/referer and local caching; fine to call
 * directly client-side at this app's scale.
 */
export default function PlaceSearch({ placeholder = "Search a place…", onSelect }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedLength = query.trim().length;
  // Derived rather than stored: once the query shrinks back below the threshold
  // there's nothing to show, without needing an effect to clear `results`.
  const visibleResults = trimmedLength >= 3 ? results : [];

  useEffect(() => {
    if (trimmedLength < 3) return;
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&viewbox=${ISTANBUL_VIEWBOX}&bounded=0&q=${encodeURIComponent(
          query
        )}`;
        const res = await fetch(url, { signal: controller.signal });
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [query, trimmedLength]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => visibleResults.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
      />
      {loading && <span className="absolute right-3.5 top-2.5 text-xs text-stone-400">…</span>}
      {open && visibleResults.length > 0 && (
        <ul className="glass-panel absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl shadow-lg">
          {visibleResults.map((r) => {
            const category = inferCategoryFromNominatim(r.class, r.type);
            return (
              <li key={r.place_id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 truncate px-3.5 py-2 text-left text-sm text-stone-700 hover:bg-sage-50"
                  onClick={() => {
                    onSelect({
                      name: r.display_name.split(",")[0],
                      lat: parseFloat(r.lat),
                      lng: parseFloat(r.lon),
                      category,
                    });
                    setQuery("");
                    setResults([]);
                    setOpen(false);
                  }}
                >
                  <span className="shrink-0">{CATEGORY_ICON[category]}</span>
                  <span className="truncate">{r.display_name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
