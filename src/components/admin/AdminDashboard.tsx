"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { GM_ACTION_LABEL, type GmAction, type PlayerTelemetry } from "@/lib/telemetry";

const AdminLiveMap = dynamic(() => import("./AdminLiveMap"), { ssr: false });
const HiddenGemStudio = dynamic(() => import("./HiddenGemStudio"), { ssr: false });
const AdminRouteMap = dynamic(() => import("./AdminRouteMap"), { ssr: false });

const GM_ACTIONS: GmAction[] = ["full_heal", "send_water", "gift_cat", "cure_fatigue"];
const POLL_MS = 8000;
const STALE_MS = 2 * 60 * 1000;

function StatBar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value < 40 : value > 60;
  const bad = invert ? value > 75 : value < 25;
  const color = bad ? "bg-terracotta-500" : good ? "bg-sage-500" : "bg-amber-500";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[11px] font-medium text-stone-500">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function PlayerCard({ player, onAction, pending, now }: {
  player: PlayerTelemetry;
  onAction: (playerId: string, action: GmAction) => void;
  pending: boolean;
  now: number;
}) {
  const stale = now - player.timestamp > STALE_MS;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold tracking-tight text-stone-800">{player.playerName}</p>
          <p className="text-[11px] text-stone-400">
            {stale ? "Last seen " : "Live · "}
            {new Date(player.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${stale ? "bg-stone-300" : "bg-sage-500"}`} />
      </div>

      <div className="flex flex-col gap-2">
        <StatBar label="Hunger" value={player.stats.hunger} />
        <StatBar label="Thirst" value={player.stats.thirst} />
        <StatBar label="Fatigue" value={player.stats.fatigueLevel} invert />
        <div className="flex items-center gap-1 text-xs font-medium text-stone-600">
          🐾 {player.stats.catCount} cats petted
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {GM_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending}
            onClick={() => onAction(player.playerId, action)}
            className="rounded-full bg-stone-800 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:opacity-40"
          >
            {GM_ACTION_LABEL[action]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PinGate({ onAuthed }: { onAuthed: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        onAuthed();
      } else {
        setError("Incorrect PIN.");
      }
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-stone-50">
      <form onSubmit={handleSubmit} className="flex w-72 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
        <h1 className="text-center text-lg font-bold tracking-tight text-stone-800">🎩 Game Master</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          className="rounded-full border border-stone-200 px-4 py-2 text-center text-sm tracking-widest text-stone-900 focus:border-sage-400 focus:outline-none"
        />
        {error && <p className="text-center text-xs text-terracotta-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !pin}
          className="rounded-full bg-stone-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-700 disabled:opacity-40"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

type AdminTab = "gm" | "gems" | "routes";

/** The Game Master dashboard for one specific trip — the trip id lives in
 *  the URL (/admin/[tripId]) rather than a bare /admin, so every tab (live
 *  player stats, Hidden Feature Studio, Route Map) opens already scoped to
 *  the right trip instead of requiring the id to be typed in by hand. */
export default function AdminDashboard({ tripId }: { tripId: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>("gm");
  const [players, setPlayers] = useState<PlayerTelemetry[]>([]);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch(`/api/sync/players?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    if (!res.ok) return;
    setAuthed(true);
    const data = (await res.json()) as PlayerTelemetry[];
    setPlayers(data.sort((a, b) => b.timestamp - a.timestamp));
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchPlayers();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPlayers]);

  useEffect(() => {
    if (!authed) return;
    pollRef.current = setInterval(fetchPlayers, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [authed, fetchPlayers]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleAction(playerId: string, action: GmAction) {
    setPendingPlayerId(playerId);
    try {
      await fetch(`/api/sync/overrides/${playerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setPendingPlayerId(null);
    }
  }

  /** Every traveler's hunger/thirst/fatigue/cat count lives only in their own
   *  phone's localStorage (never synced to the trip itself), so there's no
   *  single place to reset them from — this queues the same reset_stats
   *  override onto every currently known player, reusing the exact delivery
   *  path (~15s poll) each of the per-card actions already uses. */
  async function handleResetAllStats() {
    const action: GmAction = "reset_stats";
    setResettingAll(true);
    try {
      await Promise.all(
        players.map((p) =>
          fetch(`/api/sync/overrides/${p.playerId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }).catch(() => {
            // Best-effort — a missed player just keeps their current stats.
          })
        )
      );
    } finally {
      setResettingAll(false);
    }
  }

  if (authed === null) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-stone-50 text-stone-400">Loading…</div>
    );
  }

  if (!authed) {
    return <PinGate onAuthed={() => { setAuthed(true); fetchPlayers(); }} />;
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-stone-50">
      <div className="flex shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-4 py-2">
        <TabButton active={tab === "gm"} onClick={() => setTab("gm")}>
          🎩 Game Master
        </TabButton>
        <TabButton active={tab === "gems"} onClick={() => setTab("gems")}>
          ✨ Hidden Feature Studio
        </TabButton>
        <TabButton active={tab === "routes"} onClick={() => setTab("routes")}>
          🗺️ Route Map
        </TabButton>
        <span className="ml-auto text-[11px] text-stone-400">Trip: {tripId}</span>
      </div>

      {tab === "gm" ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="h-64 shrink-0 border-b border-stone-200 lg:h-auto lg:w-1/2 lg:border-b-0 lg:border-r">
            <AdminLiveMap players={players} />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold tracking-tight text-stone-800">🎩 Game Master Dashboard</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400">{players.length} traveler{players.length === 1 ? "" : "s"}</span>
                <button
                  onClick={handleResetAllStats}
                  disabled={resettingAll || players.length === 0}
                  type="button"
                  title="Reset hunger, thirst, fatigue, and cat count for every traveler"
                  className="rounded-full bg-terracotta-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-terracotta-700 disabled:opacity-40"
                >
                  {resettingAll ? "Resetting…" : "🔄 Reset All Stats"}
                </button>
              </div>
            </div>
            {players.length === 0 ? (
              <p className="text-sm text-stone-400">No travelers checked in yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {players.map((p) => (
                  <PlayerCard
                    key={p.playerId}
                    player={p}
                    onAction={handleAction}
                    pending={pendingPlayerId === p.playerId}
                    now={now}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === "gems" ? (
        <div className="min-h-0 flex-1">
          <HiddenGemStudio tripId={tripId} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <AdminRouteMap tripId={tripId} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
        (active ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100")
      }
    >
      {children}
    </button>
  );
}
