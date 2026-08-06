"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { CARTO_POSITRON_STYLE } from "@/lib/maplibreStyle";
import { saveGemDoc, deleteGemDoc } from "@/lib/tripSync";
import { uploadGemPhoto } from "@/lib/gemPhoto";
import { genId } from "@/lib/id";
import { dayColor } from "@/lib/dayColors";
import { pointBefore } from "@/lib/dayHelpers";
import { playerColor } from "@/lib/playerColor";
import type { HiddenGem, LatLng, Trip } from "@/lib/types";
import { PLAYER_STALE_MS, type NamedPlayerTelemetry } from "@/lib/telemetry";
import { createStepMarkerEl, createStartMarkerEl, createGemMarkerEl } from "../MapMarkers";

// Same worker-URL fix as the main player-facing MapView — see that file for
// the full explanation of why this is necessary under Turbopack.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

const FALLBACK_CENTER: [number, number] = [28.9784, 41.0082];
const DEFAULT_GEM_RADIUS_M = 20;

function lineSourceId(dayId: string, segIndex: number) {
  return `admin-route-${dayId}-${segIndex}`;
}

function toGeoJSONLine(coords: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords.map((p) => [p.lng, p.lat]) },
  };
}

interface PendingGem {
  point: LatLng;
}

/** A request to pan the camera to a specific point — `nonce` exists so
 *  clicking the same player twice in a row (same lat/lng) still re-triggers
 *  the flyTo effect, since React skips effects whose dependencies are
 *  reference-equal to last render. */
export interface FocusRequest {
  lat: number;
  lng: number;
  nonce: number;
}

/**
 * One shared map for everything the Admin used to need three separate
 * tabs for: the selected day's route/stops, every Hidden Gem (with
 * click-to-drop placement), and every player's live location — all in the
 * same view, so switching what you're looking at is a toggle, not a
 * navigation.
 */
export default function AdminMapPane({
  sessionId,
  trip,
  dayIndex,
  showRoutes,
  dropGemMode,
  onExitDropGemMode,
  players,
  focusRequest,
  now,
}: {
  sessionId: string;
  trip: Trip;
  dayIndex: number;
  showRoutes: boolean;
  dropGemMode: boolean;
  onExitDropGemMode: () => void;
  players: NamedPlayerTelemetry[];
  focusRequest: FocusRequest | null;
  /** Ticking clock from the parent (re-rendered every couple seconds) —
   *  passed in rather than read locally so a player's marker flips from
   *  live to "last seen" purely from time passing, not only when a new
   *  Firestore write happens to re-trigger the players effect below (a
   *  closed tab never writes again, so without this the marker would stay
   *  "live" styled forever). */
  now: number;
}) {
  const [pending, setPending] = useState<PendingGem | null>(null);
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapInitialized = useRef(false);
  const stepMarkersRef = useRef<maplibregl.Marker[]>([]);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeIdsRef = useRef<string[]>([]);
  const gemMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const playerMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const fitOnceRef = useRef<string | null>(null);
  const dropGemModeRef = useRef(dropGemMode);

  useEffect(() => {
    dropGemModeRef.current = dropGemMode;
  }, [dropGemMode]);

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
      if (!dropGemModeRef.current) return;
      setPending({ point: { lat: e.lngLat.lat, lng: e.lngLat.lng } });
      setCreateError(null);
      onExitDropGemMode();
    });

    return () => {
      stepMarkersRef.current.forEach((m) => m.remove());
      startMarkerRef.current?.remove();
      Object.values(gemMarkersRef.current).forEach((m) => m.remove());
      Object.values(playerMarkersRef.current).forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      isMapInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- click handler intentionally bound once; reads current mode via dropGemModeRef.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = dropGemMode ? "crosshair" : "";
  }, [dropGemMode]);

  const day = trip.days[dayIndex] ?? null;

  // ---- sync route lines + step/start markers for the selected day ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !day) return;

    function applyDay() {
      if (!map || !day) return;

      routeIdsRef.current.forEach((id) => {
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
        if (map.getSource(id)) map.removeSource(id);
      });
      routeIdsRef.current = [];

      const color = dayColor(dayIndex);
      day.steps.forEach((step, i) => {
        const route = day.routes[i];
        const from = pointBefore(day, i);
        const to: LatLng = { lat: step.lat, lng: step.lng };
        const coords = route.geometry.length >= 2 ? route.geometry : [from, to];
        const srcId = lineSourceId(day.id, i);

        map.addSource(srcId, { type: "geojson", data: toGeoJSONLine(coords) });
        map.addLayer({
          id: `${srcId}-line`,
          type: "line",
          source: srcId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: showRoutes ? "visible" : "none",
          },
          paint: {
            "line-color": color,
            "line-width": 5,
            "line-opacity": 0.85,
            ...(route.mode === "walk" ? { "line-dasharray": [0.3, 1.8] } : {}),
          },
        });
        routeIdsRef.current.push(srcId);
      });

      stepMarkersRef.current.forEach((m) => m.remove());
      stepMarkersRef.current = day.steps.map((step, i) => {
        const el = createStepMarkerEl(i + 1, step.category, false, color);
        return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([step.lng, step.lat]).addTo(map);
      });

      startMarkerRef.current?.remove();
      startMarkerRef.current = new maplibregl.Marker({
        element: createStartMarkerEl(color),
        anchor: "center",
      })
        .setLngLat([day.startPoint.lng, day.startPoint.lat])
        .addTo(map);

      if (fitOnceRef.current !== day.id) {
        fitOnceRef.current = day.id;
        const points = [day.startPoint, ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng }))];
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

    if (map.isStyleLoaded()) applyDay();
    else map.once("styledata", applyDay);
  }, [day, dayIndex, showRoutes]);

  // ---- toggle route line visibility without rebuilding sources/markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeIdsRef.current.forEach((id) => {
      if (map.getLayer(`${id}-line`)) {
        map.setLayoutProperty(`${id}-line`, "visibility", showRoutes ? "visible" : "none");
      }
    });
  }, [showRoutes]);

  // ---- gem markers (always shown, regardless of selected day) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
  }, [trip.hiddenGems]);

  // ---- player markers, colorized per-player so the admin can tell
  // travelers apart at a glance. A player who has stopped sharing live
  // location (locationLive: false) still gets a marker at their last known
  // spot instead of vanishing — useSyncTelemetry merge-writes and omits
  // lat/lng rather than nulling them out specifically so this stays
  // possible — just dimmed and pinned rather than a solid live dot, and
  // labeled "last seen" so it reads as history, not a current position.
  // Also auto-pans/zooms to reveal anyone whose location shows up for the
  // first time since this map mounted — without this, a player who joins
  // (or gets their first GPS fix) after the admin already opened the
  // dashboard would be invisible off-screen until a manual page refresh
  // happened to fit them into view. Skipped on the very first run so it
  // doesn't fight the day's own fitBounds on initial load. ----
  const seenLocatedPlayersRef = useRef<Set<string>>(new Set());
  const playersEverRenderedRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(playerMarkersRef.current).forEach((m) => m.remove());
    playerMarkersRef.current = {};

    const located = players.filter((p) => p.lat != null && p.lng != null);
    located.forEach((p) => {
      const color = p.color ?? playerColor(p.playerName);
      // Missing locationLive means a doc written before this field existed —
      // treat that the same as live, matching the old (lat/lng-always-fresh)
      // behavior for those docs. Also folds in time-based staleness — a
      // closed/crashed tab stops writing entirely, so locationLive alone
      // would stay stuck at whatever it was last set to (true) forever;
      // `now` (ticking from the parent) is what actually catches that.
      const isLive = p.locationLive !== false && now - p.timestamp <= PLAYER_STALE_MS;
      const el = document.createElement("div");
      el.className = "flex flex-col items-center gap-1";
      el.innerHTML = isLive
        ? `
        <div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>
        <div style="font-size:11px;font-weight:600;color:#292524;background:rgba(255,255,255,0.9);padding:1px 6px;border-radius:9999px;white-space:nowrap;border:1.5px solid ${color}">${p.playerName}</div>
      `
        : `
        <div style="width:14px;height:14px;border-radius:9999px 9999px 9999px 2px;transform:rotate(-45deg);background:${color};border:2px dashed white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>
        <div style="font-size:11px;font-weight:600;color:#57534e;background:rgba(255,255,255,0.9);padding:1px 6px;border-radius:9999px;white-space:nowrap;border:1.5px dashed ${color}">${p.playerName} · last seen</div>
      `;
      // MapLibre's own Marker._update() writes element.style.opacity on every
      // position tick (defaulting to "1" unless told otherwise), silently
      // clobbering a plain `el.style.opacity` assignment made before
      // construction — setOpacity() on the marker INSTANCE is the only
      // assignment that actually survives.
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng as number, p.lat as number])
        .setOpacity(isLive ? "1" : "0.6")
        .addTo(map);
      playerMarkersRef.current[p.playerName] = marker;
    });

    const newlyLocated = located.filter((p) => !seenLocatedPlayersRef.current.has(p.playerName));
    if (playersEverRenderedRef.current && newlyLocated.length > 0) {
      const bounds = located.reduce(
        (b, p) => b.extend([p.lng as number, p.lat as number]),
        new maplibregl.LngLatBounds(
          [located[0].lng as number, located[0].lat as number],
          [located[0].lng as number, located[0].lat as number]
        )
      );
      try {
        map.fitBounds(bounds, { padding: 100, maxZoom: 16, duration: 800 });
      } catch {
        // best-effort only
      }
    }
    playersEverRenderedRef.current = true;
    seenLocatedPlayersRef.current = new Set(located.map((p) => p.playerName));
    // `now` deliberately in deps — see the `isLive` comment above; every
    // other consequence of this effect (fitBounds) is idempotent against a
    // now-only re-run since seenLocatedPlayersRef is already up to date.
  }, [players, now]);

  // ---- click-to-focus: fly the camera to a player's live location when
  // their card is clicked in the sidebar ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    map.flyTo({ center: [focusRequest.lng, focusRequest.lat], zoom: 16, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fires on nonce alone; lat/lng are part of the same object.
  }, [focusRequest?.nonce]);

  async function handleCreateGem(gem: Omit<HiddenGem, "id" | "createdAt" | "imageUrl">, photoFile: File | null) {
    const id = genId();
    setSaving(true);
    setCreateError(null);
    try {
      let imageUrl: string | undefined;
      if (photoFile) {
        try {
          imageUrl = await uploadGemPhoto(sessionId, id, photoFile);
        } catch {
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

  async function handleDeleteGem(id: string) {
    setSaving(true);
    try {
      await deleteGemDoc(sessionId, id);
    } finally {
      setSaving(false);
      setSelectedGemId(null);
    }
  }

  const selectedGem = trip.hiddenGems.find((g) => g.id === selectedGemId) ?? null;

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />

      {pending && (
        <GemCreateForm
          point={pending.point}
          error={createError}
          saving={saving}
          onCancel={() => {
            setPending(null);
            setCreateError(null);
          }}
          onSave={handleCreateGem}
        />
      )}

      {selectedGem && !pending && (
        <GemDetailPanel gem={selectedGem} onClose={() => setSelectedGemId(null)} onDelete={() => handleDeleteGem(selectedGem.id)} />
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
  const [radiusM, setRadiusM] = useState(String(DEFAULT_GEM_RADIUS_M));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [driveSecretUrl, setDriveSecretUrl] = useState("");

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
        driveSecretUrl: driveSecretUrl.trim() || undefined,
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
        className="glass-panel absolute right-4 top-4 z-20 w-80 rounded-2xl p-4 shadow-xl"
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
        <label className="mt-2 flex flex-col gap-1.5">
          <span className="text-xs text-stone-500">Secret Google Drive Link (Optional)</span>
          <input
            value={driveSecretUrl}
            onChange={(e) => setDriveSecretUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/…/view"
            className="w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:border-terracotta-400 focus:outline-none"
          />
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
        className="glass-panel absolute right-4 top-4 z-20 w-80 overflow-hidden rounded-2xl shadow-xl"
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
          {gem.driveSecretUrl && (
            <p className="mt-2 truncate text-[11px] text-terracotta-600" title={gem.driveSecretUrl}>
              📷 Secret photo reward linked
            </p>
          )}
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
