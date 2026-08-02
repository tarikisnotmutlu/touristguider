"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { fetchTrip, saveTrip } from "@/lib/tripApi";
import { genId } from "@/lib/id";
import type { HiddenGem, LatLng, Trip } from "@/lib/types";
import { createGemMarkerEl } from "../MapMarkers";

// Same worker-URL fix as the main MapView — see that file for the full
// explanation of why this is necessary under Turbopack.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

const FALLBACK_CENTER: [number, number] = [28.9784, 41.0082];
const DEFAULT_RADIUS_M = 20;

interface PendingGem {
  point: LatLng;
}

/** Game-Master-only counterpart to the player app's (now removed) in-trip
 *  gem creator: loads a trip by id, lets the GM click the map to drop a
 *  Hidden Gem — with a title, note, geo-lock radius, and an optional photo —
 *  and saves it straight back to the same Vercel Blob trip document the
 *  player app polls in the background (see JourneyEngine's gem-poll effect).
 *  Deliberately a plain read/edit/PUT loop rather than routing through
 *  useTripStore — the GM's browser has no reason to be "hydrated" onto
 *  whichever trip a player happens to be viewing. */
export default function HiddenGemStudio({ tripId }: { tripId?: string } = {}) {
  const [tripIdInput, setTripIdInput] = useState(tripId ?? "");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [pending, setPending] = useState<PendingGem | null>(null);
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapInitialized = useRef(false);
  const gemMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const dropModeRef = useRef(dropMode);
  const fitOnceRef = useRef<string | null>(null);

  useEffect(() => {
    dropModeRef.current = dropMode;
  }, [dropMode]);

  // ---- map init (once) ----
  useEffect(() => {
    if (!container.current || mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    const map = new maplibregl.Map({
      container: container.current,
      style: CARTO_POSITRON_STYLE,
      center: FALLBACK_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => setTimeout(() => map.resize(), 0));
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (!dropModeRef.current) return;
      setPending({ point: { lat: e.lngLat.lat, lng: e.lngLat.lng } });
      setDropMode(false);
    });

    return () => {
      Object.values(gemMarkersRef.current).forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      isMapInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = dropMode ? "crosshair" : "";
  }, [dropMode]);

  // ---- load a trip by id ----
  const loadTrip = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setSelectedGemId(null);
    setPending(null);
    try {
      const found = await fetchTrip(id);
      if (!found) {
        setLoadError("No trip found with that id.");
        setTrip(null);
        return;
      }
      setTrip(found);
    } catch {
      setLoadError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Arriving here via /admin/[tripId] already knows which trip to show —
  // load it immediately instead of making the GM type the id in by hand.
  useEffect(() => {
    if (!tripId) return;
    const timer = setTimeout(() => loadTrip(tripId), 0);
    return () => clearTimeout(timer);
  }, [tripId, loadTrip]);

  function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    loadTrip(tripIdInput.trim());
  }

  // ---- sync gem markers onto the map whenever the loaded trip's gems change ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trip) return;

    Object.values(gemMarkersRef.current).forEach((m) => m.remove());
    gemMarkersRef.current = {};
    trip.hiddenGems.forEach((gem) => {
      const el = createGemMarkerEl();
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelectedGemId(gem.id);
      });
      gemMarkersRef.current[gem.id] = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([gem.lng, gem.lat])
        .addTo(map);
    });

    if (fitOnceRef.current !== trip.id) {
      fitOnceRef.current = trip.id;
      const points = trip.hiddenGems.length > 0 ? trip.hiddenGems : trip.days.flatMap((d) => [d.startPoint]);
      if (points.length > 0) {
        const bounds = points.reduce(
          (b, p) => b.extend([p.lng, p.lat]),
          new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
        );
        try {
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
        } catch {
          // best-effort only
        }
      }
    }
  }, [trip]);

  async function persist(nextGems: HiddenGem[]) {
    if (!trip) return;
    const nextTrip: Trip = { ...trip, hiddenGems: nextGems };
    setTrip(nextTrip);
    setSaving(true);
    try {
      await saveTrip(nextTrip);
    } finally {
      setSaving(false);
    }
  }

  function handleCreate(gem: Omit<HiddenGem, "id" | "createdAt">) {
    if (!trip) return;
    const newGem: HiddenGem = { ...gem, id: genId(), createdAt: Date.now() };
    persist([...trip.hiddenGems, newGem]);
    setPending(null);
  }

  function handleDelete(id: string) {
    if (!trip) return;
    persist(trip.hiddenGems.filter((g) => g.id !== id));
    setSelectedGemId(null);
  }

  const selectedGem = trip?.hiddenGems.find((g) => g.id === selectedGemId) ?? null;

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />

      <form
        onSubmit={handleLoad}
        className="glass-panel absolute left-4 top-4 z-10 flex w-72 flex-col gap-2 rounded-2xl p-3 shadow-lg"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Trip to edit</p>
        <div className="flex gap-1.5">
          <input
            value={tripIdInput}
            onChange={(e) => setTripIdInput(e.target.value)}
            placeholder="Trip id"
            className="w-full rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !tripIdInput.trim()}
            className="shrink-0 rounded-full bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {loading ? "…" : "Load"}
          </button>
        </div>
        {loadError && <p className="text-[11px] text-terracotta-600">{loadError}</p>}
        {trip && (
          <p className="text-[11px] text-stone-400">
            {trip.title} · {trip.hiddenGems.length} feature{trip.hiddenGems.length === 1 ? "" : "s"}
            {saving ? " · saving…" : ""}
          </p>
        )}
      </form>

      {trip && (
        <button
          onClick={() => setDropMode((v) => !v)}
          type="button"
          className={
            "glass-panel absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg " +
            (dropMode ? "ring-2 ring-terracotta-400 text-terracotta-700" : "text-stone-600 hover:text-stone-900")
          }
        >
          ✨ {dropMode ? "Click the map to drop it…" : "Drop Hidden Feature"}
        </button>
      )}

      {!trip && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-400">
          Load a trip by id to manage its hidden features.
        </div>
      )}

      {pending && (
        <GemCreateForm
          point={pending.point}
          onCancel={() => setPending(null)}
          onSave={handleCreate}
        />
      )}

      {selectedGem && !pending && (
        <GemDetailPanel gem={selectedGem} onClose={() => setSelectedGemId(null)} onDelete={() => handleDelete(selectedGem.id)} />
      )}
    </div>
  );
}

function GemCreateForm({
  point,
  onSave,
  onCancel,
}: {
  point: LatLng;
  onSave: (gem: Omit<HiddenGem, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [geoLocked, setGeoLocked] = useState(true);
  const [radiusM, setRadiusM] = useState(String(DEFAULT_RADIUS_M));
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState<string | null>(null);

  const radiusNum = Number(radiusM);
  const canSave = note.trim().length > 0 && radiusM.trim() !== "" && !Number.isNaN(radiusNum) && radiusNum > 0;

  // Native upload, no cloud bucket — the file is read straight into a data:
  // URL and stored on the gem itself (see HiddenGem.imageBase64).
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImageBase64(reader.result);
    };
    reader.onerror = () => setImageError("Couldn't read that image — try another file.");
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      lat: point.lat,
      lng: point.lng,
      note: note.trim(),
      geoLocked,
      name: name.trim() || undefined,
      radiusM: radiusNum,
      imageBase64,
    });
  }

  return (
    <AnimatePresence>
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="glass-panel absolute right-4 top-20 z-20 w-80 rounded-2xl p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold tracking-tight text-stone-800">✨ New hidden feature</h3>
        <p className="mt-0.5 text-[11px] text-stone-400">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Title (e.g. Secret Sunset Spot)"
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
        />
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Secret note / lore, revealed on discovery…"
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white/80 p-2 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
        />
        <label className="mt-2 flex flex-col gap-1.5">
          <span className="text-xs text-stone-500">Photo (optional)</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-xs text-stone-600 file:mr-2 file:rounded-full file:border-0 file:bg-terracotta-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-terracotta-700 hover:file:bg-terracotta-200"
          />
          {imageError && <span className="text-[11px] text-terracotta-600">{imageError}</span>}
          {imageBase64 && (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL, not a static asset next/image can optimize.
            <img src={imageBase64} alt="" className="h-24 w-full rounded-lg object-cover" />
          )}
        </label>
        <label className="mt-2.5 flex items-center gap-2 text-xs text-stone-600">
          Trigger radius
          <input
            value={radiusM}
            onChange={(e) => setRadiusM(e.target.value)}
            type="number"
            min={1}
            step={1}
            className="w-16 rounded-full border border-stone-200 bg-white/80 px-2 py-1 text-right text-xs text-stone-900 focus:border-terracotta-400 focus:outline-none"
          />
          meters
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={geoLocked}
            onChange={(e) => setGeoLocked(e.target.checked)}
            className="accent-terracotta-600"
          />
          🔒 Geo-Lock — require being nearby to unlock
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} type="button" className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-full bg-terracotta-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700 disabled:opacity-40"
          >
            Save feature
          </button>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}

function GemDetailPanel({ gem, onClose, onDelete }: { gem: HiddenGem; onClose: () => void; onDelete: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="glass-panel absolute right-4 top-20 z-20 w-80 overflow-hidden rounded-2xl shadow-xl"
      >
        {(gem.imageBase64 ?? gem.imageUrl) && (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL or arbitrary GM-supplied URL, not a static asset.
          <img src={gem.imageBase64 ?? gem.imageUrl} alt="" className="h-32 w-full object-cover" />
        )}
        <div className="p-4">
          <h3 className="text-sm font-semibold tracking-tight text-stone-800">{gem.name || "Untitled feature"}</h3>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {gem.lat.toFixed(5)}, {gem.lng.toFixed(5)} · {gem.geoLocked ? `🔒 ${gem.radiusM ?? 20}m` : "not geo-locked"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{gem.note}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} type="button" className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">
              Close
            </button>
            <button
              onClick={onDelete}
              type="button"
              className="rounded-full bg-terracotta-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700"
            >
              Delete feature
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
