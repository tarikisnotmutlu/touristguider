import {
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase";
import {
  dayDocRef,
  gemDocRef,
  gemsCollection,
  itineraryCollection,
  playerDocRef,
  playerOverridesCollection,
  playersCollection,
  sessionDocRef,
  sessionsCollection,
} from "./firestorePaths";
import type { Day, HiddenGem, LatLng, RouteSegment, Trip, UnplannedPlace } from "./types";
import { ROUTABLE_MODES } from "./types";
import type { PlayerTelemetry } from "./telemetry";
import { normalizeTrip } from "./normalize";
import { fetchRoute } from "./orsHttp";
import { estimateDurationMin, haversineMeters } from "./geo";
import { recomputeDayTimes } from "./time";
import { pointBefore } from "./dayHelpers";
import { createDemoTrip } from "./seed";

/** A player doc older than this is treated as abandoned (closed the tab,
 *  lost connection, went home) rather than "still in the session" — so a
 *  stale nickname never permanently blocks itself from being reused. */
const NICKNAME_STALE_MS = 5 * 60 * 1000;

/** Checked before letting someone through the onboarding gate — two
 *  travelers both posting telemetry under the same playerName would
 *  overwrite each other's sessions/{sessionId}/players/{playerName} doc. */
export async function isNicknameTaken(sessionId: string, playerName: string): Promise<boolean> {
  const snap = await getDoc(playerDocRef(sessionId, playerName));
  if (!snap.exists()) return false;
  const data = snap.data() as PlayerTelemetry;
  return Date.now() - data.timestamp < NICKNAME_STALE_MS;
}

interface SessionMetaDoc {
  title: string;
  dayOrder: string[];
  unplanned: UnplannedPlace[];
  /** Gate checked by verifySessionCredentials at lobby login. Never read
   *  into the client-side Trip model — only touched by the two functions
   *  below. */
  password?: string;
  createdAt?: unknown;
}

type DayDoc = Omit<Day, "id">;
type GemDoc = Omit<HiddenGem, "id">;

function dayToDoc(day: Day): DayDoc {
  const rest: Partial<Day> = { ...day };
  delete rest.id;
  return rest as DayDoc;
}

function docToDay(id: string, data: DayDoc): Day {
  return { id, ...data };
}

export function docToGem(id: string, data: GemDoc): HiddenGem {
  return { id, ...data };
}

export function gemToDoc(gem: HiddenGem): GemDoc {
  const rest: Partial<HiddenGem> = { ...gem };
  delete rest.id;
  return rest as GemDoc;
}

/** Thrown by createSession when the id is already taken — a concurrent
 *  double-create backstop behind the caller's own sessionExists precheck
 *  (see AdminDashboard's NewSessionForm), not the primary UX path. */
export class SessionAlreadyExistsError extends Error {}

// ---- admin: session & player management ----

export async function sessionExists(sessionId: string): Promise<boolean> {
  const snap = await getDoc(sessionDocRef(sessionId));
  return snap.exists();
}

/** Explicit Admin-only "New Session" action — session creation is 100%
 *  isolated to this function. The player lobby (see verifySessionCredentials
 *  below) only ever reads sessions/{sessionId}; it has no path that writes
 *  one into existence, so a mistyped or unknown session id in the URL bar
 *  or the join form can never silently vivify a fresh session anymore.
 *
 *  Seeds a fresh demo trip, fully ORS-resolved up front (this is a
 *  one-time creation, not an edit-mode session, so there's no "defer until
 *  Save" to apply here — otherwise a brand new session would show no
 *  routes at all until someone entered and left Edit Mode once).
 *
 *  The uniqueness check and the (slow — a real ORS fetch per stop) route
 *  resolution are two separate steps, which could race if two admins tried
 *  to create the same id at once. Claiming the session via a transaction
 *  FIRST — instantly, before any slow work — means a second concurrent
 *  caller's transaction sees it already claimed and throws immediately
 *  instead of also resolving and writing its own copy. */
export async function createSession(sessionId: string, password: string): Promise<void> {
  const claimed = await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(sessionDocRef(sessionId));
    if (snap.exists()) return false;
    tx.set(sessionDocRef(sessionId), {
      title: "Untitled Trip",
      dayOrder: [],
      unplanned: [],
      password,
      createdAt: serverTimestamp(),
    });
    return true;
  });
  if (!claimed) throw new SessionAlreadyExistsError(`Session "${sessionId}" already exists`);

  const demo = createDemoTrip();
  const resolvedDays = await Promise.all(demo.days.map((day) => resolveDayRoutes(day, undefined)));
  const batch = writeBatch(getDb());
  batch.set(sessionDocRef(sessionId), {
    title: demo.title,
    dayOrder: resolvedDays.map((d) => d.id),
    unplanned: demo.unplanned,
    password,
    createdAt: serverTimestamp(),
  });
  resolvedDays.forEach((day) => batch.set(dayDocRef(sessionId, day.id), dayToDoc(day)));
  await batch.commit();
}

export type SessionLoginResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "wrong_password" };

/** The player lobby's ONLY Firestore call for validating a join attempt —
 *  a plain read, never a write. Session creation lives exclusively in
 *  createSession above; this function must never be given a mutation
 *  fallback, no matter how tempting "just create it if missing" seems. */
export async function verifySessionCredentials(sessionId: string, password: string): Promise<SessionLoginResult> {
  const snap = await getDoc(sessionDocRef(sessionId));
  if (!snap.exists()) return { ok: false, reason: "not_found" };
  const data = snap.data() as SessionMetaDoc;
  if ((data.password ?? "") !== password) return { ok: false, reason: "wrong_password" };
  return { ok: true };
}

/** Deletes a session and everything under it: itinerary days, gems, and
 *  every player (each with its own overrides subcollection first, since
 *  Firestore never cascade-deletes subcollections on its own). */
export async function deleteSession(sessionId: string): Promise<void> {
  const [days, gems, players] = await Promise.all([
    getDocs(itineraryCollection(sessionId)),
    getDocs(gemsCollection(sessionId)),
    getDocs(playersCollection(sessionId)),
  ]);

  await Promise.all(players.docs.map((p) => deletePlayer(sessionId, p.id)));

  const batch = writeBatch(getDb());
  days.docs.forEach((d) => batch.delete(dayDocRef(sessionId, d.id)));
  gems.docs.forEach((g) => batch.delete(gemDocRef(sessionId, g.id)));
  batch.delete(sessionDocRef(sessionId));
  await batch.commit();
}

/** Removes a player from the dashboard (their telemetry doc + any queued
 *  overrides) — a "kick"/cleanup action, not a ban: if their app is still
 *  open and still posting telemetry, they'll simply reappear on their next
 *  ~20s beat. */
export async function deletePlayer(sessionId: string, playerName: string): Promise<void> {
  const overrides = await getDocs(playerOverridesCollection(sessionId, playerName));
  const batch = writeBatch(getDb());
  overrides.docs.forEach((o) => batch.delete(o.ref));
  batch.delete(playerDocRef(sessionId, playerName));
  await batch.commit();
}

/** One-time (non-realtime) list of every session — used to check "does this
 *  id already exist" before creating, without holding a listener open. */
export async function listSessionIds(): Promise<string[]> {
  const snap = await getDocs(sessionsCollection());
  return snap.docs.map((d) => d.id);
}

/** Real-time listener across the session meta doc + itinerary + gems
 *  subcollections, assembled into a single Trip on every change from any of
 *  the three. Returns the unsubscribe function — call it on unmount. */
export function subscribeToTrip(sessionId: string, onChange: (trip: Trip) => void): () => void {
  let meta: SessionMetaDoc = { title: "Untitled Trip", dayOrder: [], unplanned: [] };
  const daysById = new Map<string, Day>();
  let gems: HiddenGem[] = [];

  function emit() {
    const orderedDays = meta.dayOrder
      .map((id) => daysById.get(id))
      .filter((d): d is Day => !!d);
    // A day doc that exists but isn't in dayOrder yet (the instant after it
    // was added, before the session meta write lands) still shows up,
    // appended at the end rather than disappearing for a beat.
    const extra = [...daysById.values()].filter((d) => !meta.dayOrder.includes(d.id));
    onChange(
      normalizeTrip({
        id: sessionId,
        title: meta.title,
        days: [...orderedDays, ...extra],
        hiddenGems: gems,
        unplanned: meta.unplanned,
      })
    );
  }

  // An onSnapshot listener that errors (permission-denied, Firestore API not
  // enabled on the project, offline with no cache, ...) otherwise fails
  // silently — no error ever reaches `onChange`, so the caller just hangs on
  // "Loading...". Logging it here at least makes that debuggable instead of
  // a mysterious infinite spinner.
  function logSnapshotError(source: string) {
    return (err: unknown) => console.error(`[tripSync] ${source} listener failed:`, err);
  }

  const unsubMeta = onSnapshot(
    sessionDocRef(sessionId),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<SessionMetaDoc>;
        meta = {
          title: data.title ?? "Untitled Trip",
          dayOrder: data.dayOrder ?? [],
          unplanned: data.unplanned ?? [],
        };
      }
      emit();
    },
    logSnapshotError("session meta")
  );
  const unsubDays = onSnapshot(
    itineraryCollection(sessionId),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "removed") daysById.delete(change.doc.id);
        else daysById.set(change.doc.id, docToDay(change.doc.id, change.doc.data() as DayDoc));
      });
      emit();
    },
    logSnapshotError("itinerary")
  );
  const unsubGems = onSnapshot(
    gemsCollection(sessionId),
    (snap) => {
      gems = snap.docs.map((d) => docToGem(d.id, d.data() as GemDoc));
      emit();
    },
    logSnapshotError("gems")
  );

  return () => {
    unsubMeta();
    unsubDays();
    unsubGems();
  };
}

// ---- deferred-ORS delta save (Priority 3) ----

/** A snapshot of the trip taken the instant Edit Mode was entered — the
 *  baseline every edge gets diffed against on Save, so only edges an edit
 *  actually touched get a fresh ORS fetch. Module-level rather than
 *  component state: it's write-once/read-once bookkeeping for exactly one
 *  edit session, not something any component needs to re-render on. */
let editSnapshot: Trip | null = null;

export function beginEditSession(trip: Trip) {
  editSnapshot = JSON.parse(JSON.stringify(trip));
}

export function discardEditSession() {
  editSnapshot = null;
}

function edgeIdentity(fromId: string, toId: string): string {
  return `${fromId}=>${toId}`;
}

// Coordinates are part of the fingerprint, not just mode/manualWaypoints —
// moving a step (or the day's start point) via "Adjust pin location" keeps
// the same edge identity (same step ids either side) and the same
// mode/manualWaypoints, so without the actual endpoint coordinates here,
// this would consider the edge "unchanged" and reuse its stale pre-move
// geometry: the saved route would visibly not connect to the marker's new
// position at all.
function edgeFingerprint(route: RouteSegment, from: LatLng, to: LatLng): string {
  return `${route.mode}|${from.lat},${from.lng}|${to.lat},${to.lng}|${JSON.stringify(route.manualWaypoints)}`;
}

/** Diffs `day` against its counterpart in the edit-start snapshot (if any)
 *  and returns a map of edge identity -> the OLD route, for every edge
 *  whose endpoints/mode/manual-waypoints are unchanged AND whose old
 *  geometry was actually resolved (never reuse a still-degraded estimate). */
function unchangedEdgesOf(day: Day, oldDay: Day | undefined): Map<string, RouteSegment> {
  const map = new Map<string, RouteSegment>();
  if (!oldDay) return map;
  const oldEdgeByIdentity = new Map<string, { route: RouteSegment; fingerprint: string }>();
  oldDay.steps.forEach((s, i) => {
    const fromId = i === 0 ? `start:${oldDay.id}` : oldDay.steps[i - 1].id;
    const from = pointBefore(oldDay, i);
    const to: LatLng = { lat: s.lat, lng: s.lng };
    oldEdgeByIdentity.set(edgeIdentity(fromId, s.id), {
      route: oldDay.routes[i],
      fingerprint: edgeFingerprint(oldDay.routes[i], from, to),
    });
  });
  day.steps.forEach((s, i) => {
    const fromId = i === 0 ? `start:${day.id}` : day.steps[i - 1].id;
    const identity = edgeIdentity(fromId, s.id);
    const oldEntry = oldEdgeByIdentity.get(identity);
    if (!oldEntry || !oldEntry.route.geometryResolved) return;
    const from = pointBefore(day, i);
    const to: LatLng = { lat: s.lat, lng: s.lng };
    const newFingerprint = edgeFingerprint(day.routes[i], from, to);
    if (oldEntry.fingerprint === newFingerprint) {
      map.set(identity, oldEntry.route);
    }
  });
  return map;
}

/**
 * Resolves every routable edge in `day`: reuses the cached geometry from
 * `oldDay` (if given) when that specific edge is unchanged since then,
 * otherwise fetches ORS fresh (falling back to a straight-line-through-
 * waypoints estimate if ORS fails). Non-routable edges (transit/ferry) are
 * always cheap to recompute directly, `oldDay` or not.
 */
async function resolveDayRoutes(day: Day, oldDay: Day | undefined): Promise<Day> {
  const unchanged = unchangedEdgesOf(day, oldDay);

  const routes = await Promise.all(
    day.steps.map(async (step, i): Promise<RouteSegment> => {
      const route = day.routes[i];
      const from = pointBefore(day, i);
      const to = { lat: step.lat, lng: step.lng };

      if (!ROUTABLE_MODES.includes(route.mode)) {
        const distanceM = haversineMeters(from, to);
        return {
          ...route,
          distanceM,
          durationMin: estimateDurationMin(distanceM, route.mode),
          geometry: [from, to],
          geometryResolved: true,
          geometryDegraded: false,
        };
      }

      const fromId = i === 0 ? `start:${day.id}` : day.steps[i - 1].id;
      const cached = unchanged.get(edgeIdentity(fromId, step.id));
      if (cached) {
        return {
          ...route,
          distanceM: cached.distanceM,
          durationMin: cached.durationMin,
          geometry: cached.geometry,
          geometryResolved: true,
          geometryDegraded: false,
        };
      }

      const waypoints = [from, ...route.manualWaypoints, to];
      try {
        const result = await fetchRoute(waypoints, route.mode);
        return { ...route, ...result, geometryResolved: true, geometryDegraded: false };
      } catch {
        let distanceM = 0;
        for (let w = 1; w < waypoints.length; w++) {
          distanceM += haversineMeters(waypoints[w - 1], waypoints[w]);
        }
        return {
          ...route,
          distanceM,
          durationMin: estimateDurationMin(distanceM, route.mode),
          geometry: waypoints,
          geometryResolved: false,
          geometryDegraded: true,
        };
      }
    })
  );

  const resolvedDay: Day = { ...day, routes };
  resolvedDay.steps = recomputeDayTimes(resolvedDay);
  return resolvedDay;
}

/**
 * Called once, when the user hits "Done" to leave Edit Mode. Diffs every
 * day against the edit-start snapshot and only re-fetches ORS for edges
 * that actually changed; everything else reuses its cached geometry.
 * Finally batch-writes the resolved trip to Firestore.
 */
export async function saveEditsToFirestore(sessionId: string, trip: Trip): Promise<Trip> {
  const before = editSnapshot;
  const oldDaysById = new Map((before?.days ?? []).map((d) => [d.id, d]));

  const resolvedDays: Day[] = await Promise.all(
    trip.days.map((day) => resolveDayRoutes(day, oldDaysById.get(day.id)))
  );

  const finalTrip: Trip = { ...trip, days: resolvedDays };

  const batch = writeBatch(getDb());
  batch.set(sessionDocRef(sessionId), {
    title: finalTrip.title,
    dayOrder: finalTrip.days.map((d) => d.id),
    unplanned: finalTrip.unplanned,
  });
  finalTrip.days.forEach((day) => batch.set(dayDocRef(sessionId, day.id), dayToDoc(day)));
  const currentDayIds = new Set(finalTrip.days.map((d) => d.id));
  (before?.days ?? []).forEach((d) => {
    if (!currentDayIds.has(d.id)) batch.delete(dayDocRef(sessionId, d.id));
  });
  await batch.commit();

  editSnapshot = null;
  return finalTrip;
}

export async function saveGemDoc(sessionId: string, gem: HiddenGem): Promise<void> {
  await setDoc(gemDocRef(sessionId, gem.id), gemToDoc(gem));
}

export async function deleteGemDoc(sessionId: string, gemId: string): Promise<void> {
  await deleteDoc(gemDocRef(sessionId, gemId));
}

/** Also used by the admin Route Map tab's "Reset Day" — writes straight to
 *  the day doc rather than going through the delta-save/edit-session flow,
 *  since it's an admin action against another session's live data, not the
 *  local player's own in-progress edit. */
export async function saveDayDoc(sessionId: string, day: Day): Promise<void> {
  await setDoc(dayDocRef(sessionId, day.id), dayToDoc(day));
}

export async function fetchTripOnce(sessionId: string): Promise<Trip | null> {
  const snap = await getDoc(sessionDocRef(sessionId));
  if (!snap.exists()) return null;
  const meta = snap.data() as Partial<SessionMetaDoc>;
  const { getDocs } = await import("firebase/firestore");
  const [dayDocs, gemDocs] = await Promise.all([
    getDocs(itineraryCollection(sessionId)),
    getDocs(gemsCollection(sessionId)),
  ]);
  const daysById = new Map(dayDocs.docs.map((d) => [d.id, docToDay(d.id, d.data() as DayDoc)]));
  const dayOrder = meta.dayOrder ?? [];
  const orderedDays = dayOrder.map((id) => daysById.get(id)).filter((d): d is Day => !!d);
  const extra = [...daysById.values()].filter((d) => !dayOrder.includes(d.id));
  return normalizeTrip({
    id: sessionId,
    title: meta.title ?? "Untitled Trip",
    days: [...orderedDays, ...extra],
    hiddenGems: gemDocs.docs.map((d) => docToGem(d.id, d.data() as GemDoc)),
    unplanned: meta.unplanned ?? [],
  });
}
