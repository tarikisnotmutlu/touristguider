"use client";

import { useEffect, useRef, useState } from "react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface PlaceSearchProps {
  placeholder?: string;
  onSelect: (place: { name: string; lat: number; lng: number }) => void;
}

/**
 * Free-tier autocomplete against Nominatim's public search API — no API key.
 * For heavier production traffic Nominatim's usage policy asks for a proxy with a
 * proper User-Agent/referer and local caching; fine to call directly client-side
 * at this app's scale.
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
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(
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
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      {loading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span>}
      {open && visibleResults.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {visibleResults.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  onSelect({
                    name: r.display_name.split(",")[0],
                    lat: parseFloat(r.lat),
                    lng: parseFloat(r.lon),
                  });
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
