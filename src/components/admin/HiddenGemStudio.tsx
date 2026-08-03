"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { onSnapshot } from "firebase/firestore";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { gemsCollection } from "@/lib/firestorePaths";
import { docToGem, saveGemDoc, deleteGemDoc } from "@/lib/tripSync";
import { uploadGemPhoto } from "@/lib/gemPhoto";
import { genId } from "@/lib/id";
import type { HiddenGem, LatLng } from "@/lib/types";
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
 *  gem creator: real-time (onSnapshot) list of Hidden Gems for whichever
 *  session the Session Switcher has selected, click-to-drop placement, and
 *  a native file upload straight to Firebase Storage — the resulting
 *  downloadURL is what gets saved onto the gem document and what the
 *  player app renders directly. */
export default function HiddenGemStudio({ sessionId }: { sessionId: string }) {
  const [gems, setGems] = useState<HiddenGem[]>([]);
  const [dropMode, setDropMode] = useState(false);
  const [pending, setPending] = useState<PendingGem | null>(null);
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
      setCreateError(null);
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

  // ---- real-time gems for the selected session ----
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedGemId(null);
      setPending(null);
    }, 0);
    const unsub = onSnapshot(gemsCollection(sessionId), (snap) => {
      setGems(snap.docs.map((d) => docToGem(d.id, d.data() as Omit<HiddenGem, "id">)));
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [sessionId]);

  // ---- sync gem markers onto the map whenever the live gem list changes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(gemMarkersRef.current).forEach((m) => m.remove());
    gemMarkersRef.current = {};
    gems.forEach((gem) => {
      const el = createGemMarkerEl();
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelectedGemId(gem.id);
      });
      gemMarkersRef.current[gem.id] = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([gem.lng, gem.lat])
        .addTo(map);
    });

    if (fitOnceRef.current !== sessionId && gems.length > 0) {
      fitOnceRef.current = sessionId;
      const bounds = gems.reduce(
        (b, p) => b.extend([p.lng, p.lat]),
        new maplibregl.LngLatBounds([gems[0].lng, gems[0].lat], [gems[0].lng, gems[0].lat])
      );
      try {
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
      } catch {
        // best-effort only
      }
    }
  }, [gems, sessionId]);

  async function handleCreate(gem: Omit<HiddenGem, "id" | "createdAt" | "imageUrl">, photoFile: File | null) {
    const id = genId();
    setSaving(true);
    setCreateError(null);
    try {
      let imageUrl: string | undefined;
      if (photoFile) {
        try {
          imageUrl = await uploadGemPhoto(sessionId, id, photoFile);
        } catch {
          // Storage needs the Blaze billing plan enabled — a project on the
          // free Spark plan throws here on every upload. Surface that
          // clearly rather than silently dropping the whole gem (the note
          // and location are still worth saving even without a photo).
          setCreateError(
            "Couldn't upload the photo — Firebase Storage isn't enabled for this project (it needs the Blaze billing plan). Remove the photo to save without one, or enable Storage and try again."
          );
          return;
        }
      }
      await saveGemDoc(sessionId, { ...gem, imageUrl, id, createdAt: Date.now() });
      setPending(null);
    } catch {
      setCreateError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await deleteGemDoc(sessionId, id);
    } finally {
      setSaving(false);
      setSelectedGemId(null);
    }
  }

  const selectedGem = gems.find((g) => g.id === selectedGemId) ?? null;

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />

      <div className="glass-panel absolute left-4 top-4 z-10 rounded-2xl p-3 shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Hidden features</p>
        <p className="mt-1 text-[11px] text-stone-400">
          {gems.length} feature{gems.length === 1 ? "" : "s"}
          {saving ? " · saving…" : ""}
        </p>
      </div>

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

      {pending && (
        <GemCreateForm
          point={pending.point}
          error={createError}
          saving={saving}
          onCancel={() => {
            setPending(null);
            setCreateError(null);
          }}
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
  error,
  saving,
  onSave,
  onCancel,
}: {
  point: LatLng;
  error: string | null;
  saving: boolean;
  onSave: (gem: Omit<HiddenGem, "id" | "createdAt" | "imageUrl">, photoFile: File | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [geoLocked, setGeoLocked] = useState(true);
  const [radiusM, setRadiusM] = useState(String(DEFAULT_RADIUS_M));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const radiusNum = Number(radiusM);
  const canSave = note.trim().length > 0 && radiusM.trim() !== "" && !Number.isNaN(radiusNum) && radiusNum > 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave(
      {
        lat: point.lat,
        lng: point.lng,
        note: note.trim(),
        geoLocked,
        name: name.trim() || undefined,
        radiusM: radiusNum,
      },
      photoFile
    );
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
          {previewUrl && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a static asset. */}
              <img src={previewUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPhotoFile(null);
                  setPreviewUrl(null);
                }}
                title="Remove photo"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900/60 text-xs text-white hover:bg-stone-900/80"
              >
                ✕
              </button>
            </div>
          )}
        </label>
        {error && <p className="mt-2 text-[11px] leading-relaxed text-terracotta-600">{error}</p>}
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
            disabled={!canSave || saving}
            className="rounded-full bg-terracotta-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-terracotta-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save feature"}
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
        {gem.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage downloadURL, not a static asset.
          <img src={gem.imageUrl} alt="" className="h-32 w-full object-cover" />
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
