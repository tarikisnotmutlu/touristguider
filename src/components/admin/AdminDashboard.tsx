"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { addDoc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  applyGmActionToStats,
  GM_ACTION_LABEL,
  type GmAction,
  type GmOverride,
  type NamedPlayerTelemetry,
  type PlayerTelemetry,
} from "@/lib/telemetry";
import { playerDocRef, playerOverridesCollection, playersCollection, sessionsCollection } from "@/lib/firestorePaths";
import { createSession, deletePlayer, deleteSession, sessionExists, subscribeToTrip } from "@/lib/tripSync";
import { playerColor } from "@/lib/playerColor";
import type { Trip } from "@/lib/types";
import type { FocusRequest } from "./AdminMapPane";

const AdminMapPane = dynamic(() => import("./AdminMapPane"), { ssr: false });

const GM_ACTIONS: GmAction[] = ["full_heal", "send_water", "gift_cat", "cure_fatigue"];
const STALE_MS = 2 * 60 * 1000;

type Player = NamedPlayerTelemetry;

interface SessionOption {
  id: string;
  title: string;
}

const EMPTY_TRIP: Trip = { id: "", title: "", days: [], hiddenGems: [], unplanned: [] };

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

function PlayerCard({
  player,
  onAction,
  onMessage,
  onDelete,
  onFocus,
  pending,
  now,
}: {
  player: Player;
  onAction: (playerName: string, action: GmAction) => void;
  onMessage: (playerName: string) => void;
  onDelete: (playerName: string) => void;
  onFocus: (player: Player) => void;
  pending: boolean;
  now: number;
}) {
  const stale = now - player.timestamp > STALE_MS;
  const color = player.color ?? playerColor(player.playerName);
  const located = player.lat != null && player.lng != null;

  return (
    <div
      role="button"
      tabIndex={located ? 0 : -1}
      onClick={() => located && onFocus(player)}
      onKeyDown={(e) => located && (e.key === "Enter" || e.key === " ") && onFocus(player)}
      title={located ? "Click to fly the map to this player" : "No live location yet"}
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
      className={`flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow ${
        located ? "cursor-pointer hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {player.playerName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-stone-800">{player.playerName}</p>
            <p className="text-[11px] text-stone-400">
              {stale ? "Last seen " : "Live · "}
              {new Date(player.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${stale ? "bg-stone-300" : "bg-sage-500"}`} />
          <button
            type="button"
            title="Kick / remove this player"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(player.playerName);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-terracotta-50 text-sm text-terracotta-600 transition-colors hover:bg-terracotta-600 hover:text-white"
          >
            🗑️
          </button>
        </div>
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
            onClick={(e) => {
              e.stopPropagation();
              onAction(player.playerName, action);
            }}
            className="rounded-full bg-stone-800 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:opacity-40"
          >
            {GM_ACTION_LABEL[action]}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            onMessage(player.playerName);
          }}
          className="col-span-2 rounded-full bg-sage-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-sage-700 disabled:opacity-40"
        >
          💬 Send Message
        </button>
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
        <h1 className="text-center text-lg font-bold tracking-tight text-stone-800">🎩 Admin</h1>
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

function NewSessionForm({ existingIds, onCreated }: { existingIds: string[]; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = id.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      if (existingIds.includes(trimmed) || (await sessionExists(trimmed))) {
        setError("That session id is already taken.");
        return;
      }
      await createSession(trimmed);
      setId("");
      setOpen(false);
      onCreated(trimmed);
    } catch {
      setError("Couldn't create session — try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-sage-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sage-700"
      >
        + New Session
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex items-center gap-1.5">
      <input
        autoFocus
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="session-id"
        className="w-36 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={creating || !id.trim()}
        className="rounded-full bg-sage-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sage-700 disabled:opacity-40"
      >
        {creating ? "…" : "Create"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
          setId("");
        }}
        className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-terracotta-600">{error}</span>}
    </form>
  );
}

function MessageForm({ playerName, onSend, onCancel, sending }: {
  playerName: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  sending: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text.trim());
      }}
      className="glass-panel fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-80 rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold tracking-tight text-stone-800">💬 Message {playerName}</h3>
        <p className="mt-0.5 text-[11px] text-stone-400">Only {playerName} will see this, on their screen.</p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Type a message…"
          className="mt-2 w-full rounded-lg border border-stone-200 p-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sage-400 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-full bg-sage-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sage-700 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** The Admin dashboard — a single always-visible pane (no tabs): a
 *  session switcher (create/delete), a day selector + route/gem toggles
 *  driving one shared map, and a player roster with GM actions, targeted
 *  messaging, and deletion, all live via Firestore onSnapshot. */
export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [pendingPlayerName, setPendingPlayerName] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [messageTarget, setMessageTarget] = useState<string | null>(null);

  const [trip, setTrip] = useState<Trip>(EMPTY_TRIP);
  const [dayIndex, setDayIndex] = useState(0);
  const [showRoutes, setShowRoutes] = useState(true);
  const [dropGemMode, setDropGemMode] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  function focusPlayer(player: Player) {
    if (player.lat == null || player.lng == null) return;
    setFocusRequest({ lat: player.lat, lng: player.lng, nonce: Date.now() });
  }

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

  useEffect(() => {
    if (!authed || !selectedSessionId) {
      const timer = setTimeout(() => setTrip(EMPTY_TRIP), 0);
      return () => clearTimeout(timer);
    }
    const unsub = subscribeToTrip(selectedSessionId, setTrip);
    return unsub;
  }, [authed, selectedSessionId]);

  function selectSession(id: string) {
    setSelectedSessionId(id);
    setDayIndex(0);
    setDropGemMode(false);
  }

  const safeDayIndex = Math.min(dayIndex, Math.max(0, trip.days.length - 1));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  /** Same offline-safe pattern as handleResetAllStats: write the new stats
   *  straight to the player's Firestore doc (works whether or not their app
   *  is open) and queue the override too, so an online player's local state
   *  and next telemetry beat land on the same numbers instead of the old
   *  local value clobbering the direct write. */
  async function handleAction(playerName: string, action: GmAction) {
    if (action === "message") return;
    setPendingPlayerName(playerName);
    try {
      const current = players.find((p) => p.playerName === playerName);
      if (current) {
        await updateDoc(playerDocRef(selectedSessionId, playerName), {
          stats: applyGmActionToStats(current.stats, action),
        }).catch(() => {
          // Best-effort — the queued override below still reaches an online player.
        });
      }
      const override: GmOverride = { action, createdAt: Date.now() };
      await addDoc(playerOverridesCollection(selectedSessionId, playerName), override);
    } finally {
      setPendingPlayerName(null);
    }
  }

  async function handleSendMessage(playerName: string, text: string) {
    setPendingPlayerName(playerName);
    try {
      const override: GmOverride = { action: "message", text, createdAt: Date.now() };
      await addDoc(playerOverridesCollection(selectedSessionId, playerName), override);
      setMessageTarget(null);
    } finally {
      setPendingPlayerName(null);
    }
  }

  async function handleDeletePlayer(playerName: string) {
    if (!confirm(`Remove ${playerName} from this session's dashboard?`)) return;
    setPendingPlayerName(playerName);
    try {
      await deletePlayer(selectedSessionId, playerName);
    } finally {
      setPendingPlayerName(null);
    }
  }

  async function handleDeleteSession() {
    if (!selectedSessionId) return;
    if (!confirm(`Permanently delete session "${selectedSessionId}" and all its days, gems, and players?`)) return;
    setDeletingSession(true);
    try {
      await deleteSession(selectedSessionId);
    } finally {
      setDeletingSession(false);
    }
  }

  /** Every traveler's hunger/thirst/fatigue/cat count normally lives in their
   *  own phone's localStorage, only mirrored to Firestore every ~20s while
   *  their app is open — an override alone would sit queued and invisible
   *  until they reopen. This writes the reset straight to each player's
   *  Firestore doc first (works instantly, no player device needed — the
   *  admin dashboard reads only that doc, never localStorage), then also
   *  queues the override so an online player's local state — and next
   *  telemetry beat — stays in sync instead of clobbering the reset. */
  async function handleResetAllStats() {
    const action: GmAction = "reset_stats";
    setResettingAll(true);
    try {
      await Promise.all(
        players.map(async (p) => {
          await updateDoc(playerDocRef(selectedSessionId, p.playerName), {
            stats: applyGmActionToStats(p.stats, action),
          }).catch(() => {
            // Best-effort — a missed player just keeps their current stats.
          });
          const override: GmOverride = { action, createdAt: Date.now() };
          return addDoc(playerOverridesCollection(selectedSessionId, p.playerName), override).catch(() => {
            // Best-effort — the direct Firestore write above already applied.
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <h1 className="text-sm font-bold tracking-tight text-stone-800">🎩 Admin</h1>

        <select
          value={selectedSessionId}
          onChange={(e) => selectSession(e.target.value)}
          className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 focus:border-sage-400 focus:outline-none"
        >
          {sessions.length === 0 && <option value="">No sessions yet</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.id})
            </option>
          ))}
        </select>

        <NewSessionForm existingIds={sessions.map((s) => s.id)} onCreated={selectSession} />

        {selectedSessionId && (
          <button
            type="button"
            onClick={handleDeleteSession}
            disabled={deletingSession}
            className="rounded-full bg-terracotta-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-terracotta-700 disabled:opacity-40"
          >
            {deletingSession ? "Deleting…" : "Delete Session"}
          </button>
        )}

        {selectedSessionId && trip.days.length > 0 && (
          <div className="ml-2 flex items-center gap-1.5">
            {trip.days.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDayIndex(i)}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                  (i === safeDayIndex ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")
                }
              >
                {d.label || `Day ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {selectedSessionId && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
            <input type="checkbox" checked={showRoutes} onChange={(e) => setShowRoutes(e.target.checked)} className="accent-sage-600" />
            Show routes
          </label>
        )}

        {selectedSessionId && (
          <button
            type="button"
            onClick={() => setDropGemMode((v) => !v)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
              (dropGemMode ? "bg-terracotta-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")
            }
          >
            {dropGemMode ? "Click map to place ✨" : "✨ Add Hidden Feature"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-stone-400">
            {players.length} traveler{players.length === 1 ? "" : "s"}
          </span>
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

      {!selectedSessionId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-stone-400">
          No sessions yet — create one above, or wait for a traveler to join.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="h-72 shrink-0 border-b border-stone-200 lg:h-auto lg:flex-1 lg:border-b-0 lg:border-r">
            <AdminMapPane
              sessionId={selectedSessionId}
              trip={trip}
              dayIndex={safeDayIndex}
              showRoutes={showRoutes}
              dropGemMode={dropGemMode}
              onExitDropGemMode={() => setDropGemMode(false)}
              players={players}
              focusRequest={focusRequest}
            />
          </div>
          <div className="min-h-0 overflow-y-auto p-4 lg:w-96 lg:max-w-md lg:shrink-0">
            {players.length === 0 ? (
              <p className="text-sm text-stone-400">No travelers checked in yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {players.map((p) => (
                  <PlayerCard
                    key={p.playerName}
                    player={p}
                    onAction={handleAction}
                    onMessage={setMessageTarget}
                    onDelete={handleDeletePlayer}
                    onFocus={focusPlayer}
                    pending={pendingPlayerName === p.playerName}
                    now={now}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {messageTarget && (
        <MessageForm
          playerName={messageTarget}
          sending={pendingPlayerName === messageTarget}
          onCancel={() => setMessageTarget(null)}
          onSend={(text) => handleSendMessage(messageTarget, text)}
        />
      )}
    </div>
  );
}
