"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { addDoc, onSnapshot } from "firebase/firestore";
import {
  GM_ACTION_LABEL,
  type GmAction,
  type GmOverride,
  type NamedPlayerTelemetry,
  type PlayerTelemetry,
} from "@/lib/telemetry";
import { playerOverridesCollection, playersCollection, sessionsCollection } from "@/lib/firestorePaths";

const AdminLiveMap = dynamic(() => import("./AdminLiveMap"), { ssr: false });
const HiddenGemStudio = dynamic(() => import("./HiddenGemStudio"), { ssr: false });
const AdminRouteMap = dynamic(() => import("./AdminRouteMap"), { ssr: false });

const GM_ACTIONS: GmAction[] = ["full_heal", "send_water", "gift_cat", "cure_fatigue"];
const STALE_MS = 2 * 60 * 1000;

type Player = NamedPlayerTelemetry;

interface SessionOption {
  id: string;
  title: string;
}

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
  player: Player;
  onAction: (playerName: string, action: GmAction) => void;
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
            onClick={() => onAction(player.playerName, action)}
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

function SessionSwitcher({ sessions, selectedSessionId, onSelect }: {
  sessions: SessionOption[];
  selectedSessionId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <select
      value={selectedSessionId}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 focus:border-sage-400 focus:outline-none"
    >
      {sessions.length === 0 && <option value="">No sessions yet</option>}
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title} ({s.id})
        </option>
      ))}
    </select>
  );
}

type AdminTab = "gm" | "gems" | "routes";

/** The Game Master dashboard — a Session Switcher dropdown (real-time, so a
 *  brand-new session shows up the moment its first player joins) replaces
 *  the old URL-encoded trip id; every tab (live player stats, Hidden
 *  Feature Studio, Route Map) reads/writes whichever session is selected. */
export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>("gm");
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [pendingPlayerName, setPendingPlayerName] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/auth", { cache: "no-store" });
        const data = (await res.json()) as { authed: boolean };
        if (!cancelled) setAuthed(data.authed);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    const unsub = onSnapshot(sessionsCollection(), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, title: (d.data().title as string) ?? d.id }));
      setSessions(list);
      setSelectedSessionId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
    });
    return unsub;
  }, [authed]);

  useEffect(() => {
    if (!authed || !selectedSessionId) {
      const timer = setTimeout(() => setPlayers([]), 0);
      return () => clearTimeout(timer);
    }
    const unsub = onSnapshot(playersCollection(selectedSessionId), (snap) => {
      const list = snap.docs.map((d) => ({ playerName: d.id, ...(d.data() as PlayerTelemetry) }));
      setPlayers(list.sort((a, b) => b.timestamp - a.timestamp));
    });
    return unsub;
  }, [authed, selectedSessionId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleAction(playerName: string, action: GmAction) {
    setPendingPlayerName(playerName);
    try {
      const override: GmOverride = { action, createdAt: Date.now() };
      await addDoc(playerOverridesCollection(selectedSessionId, playerName), override);
    } finally {
      setPendingPlayerName(null);
    }
  }

  /** Every traveler's hunger/thirst/fatigue/cat count lives only in their own
   *  phone's localStorage (never synced to the trip itself), so there's no
   *  single place to reset them from — this queues the same reset_stats
   *  override onto every currently known player. */
  async function handleResetAllStats() {
    const action: GmAction = "reset_stats";
    setResettingAll(true);
    try {
      await Promise.all(
        players.map((p) => {
          const override: GmOverride = { action, createdAt: Date.now() };
          return addDoc(playerOverridesCollection(selectedSessionId, p.playerName), override).catch(() => {
            // Best-effort — a missed player just keeps their current stats.
          });
        })
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
    return <PinGate onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-stone-50">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <TabButton active={tab === "gm"} onClick={() => setTab("gm")}>
          🎩 Game Master
        </TabButton>
        <TabButton active={tab === "gems"} onClick={() => setTab("gems")}>
          ✨ Hidden Feature Studio
        </TabButton>
        <TabButton active={tab === "routes"} onClick={() => setTab("routes")}>
          🗺️ Route Map
        </TabButton>
        <div className="ml-auto">
          <SessionSwitcher sessions={sessions} selectedSessionId={selectedSessionId} onSelect={setSelectedSessionId} />
        </div>
      </div>

      {!selectedSessionId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-stone-400">
          No sessions yet — one appears here the moment a traveler joins.
        </div>
      ) : tab === "gm" ? (
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
                    key={p.playerName}
                    player={p}
                    onAction={handleAction}
                    pending={pendingPlayerName === p.playerName}
                    now={now}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === "gems" ? (
        <div className="min-h-0 flex-1">
          <HiddenGemStudio sessionId={selectedSessionId} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <AdminRouteMap sessionId={selectedSessionId} />
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
