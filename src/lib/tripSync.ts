import { deleteDoc, getDoc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { getDb } from "./firebase";
import {
  dayDocRef,
  gemDocRef,
  gemsCollection,
  itineraryCollection,
  sessionDocRef,
} from "./firestorePaths";
import type { Day, HiddenGem, RouteSegment, Trip, UnplannedPlace } from "./types";
import { ROUTABLE_MODES } from "./types";
import { normalizeTrip } from "./normalize";
import { fetchRoute } from "./osrmHttp";
import { estimateDurationMin, haversineMeters } from "./geo";
import { recomputeDayTimes } from "./time";
import { pointBefore } from "./dayHelpers";
import { createDemoTrip } from "./seed";

interface SessionMetaDoc {
  title: string;
  dayOrder: string[];
  unplanned: UnplannedPlace[];
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

/** First time this session id has ever been used — seeds it with a fresh
 *  demo trip, fully OSRM-resolved up front (this is a one-time creation, not
 *  an edit-mode session, so there's no "defer until Save" to apply here —
 *  otherwise a brand new session would show no routes at all until someone
 *  entered and left Edit Mode once). */
export async function ensureSessionExists(sessionId: string): Promise<void> {
  const existing = await getDoc(sessionDocRef(sessionId));
  if (existing.exists()) return;
  const demo = createDemoTrip();
  const resolvedDays = await Promise.all(demo.days.map((day) => resolveDayRoutes(day, undefined)));
  const batch = writeBatch(getDb());
  batch.set(sessionDocRef(sessionId), {
    title: demo.title,
    dayOrder: resolvedDays.map((d) => d.id),
    unplanned: demo.unplanned,
  });
  resolvedDays.forEach((day) => batch.set(dayDocRef(sessionId, day.id), dayToDoc(day)));
  await batch.commit();
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

// ---- deferred-OSRM delta save (Priority 3) ----

/** A snapshot of the trip taken the instant Edit Mode was entered — the
 *  baseline every edge gets diffed against on Save, so only edges an edit
 *  actually touched get a fresh OSRM fetch. Module-level rather than
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

function edgeFingerprint(route: RouteSegment): string {
  return `${route.mode}|${JSON.stringify(route.manualWaypoints)}`;
}

/** Diffs `day` against its counterpart in the edit-start snapshot (if any)
 *  and returns a map of edge identity -> the OLD route, for every edge
 *  whose endpoints/mode/manual-waypoints are unchanged AND whose old
 *  geometry was actually resolved (never reuse a still-degraded estimate). */
function unchangedEdgesOf(day: Day, oldDay: Day | undefined): Map<string, RouteSegment> {
  const map = new Map<string, RouteSegment>();
  if (!oldDay) return map;
  const oldEdgeByIdentity = new Map<string, RouteSegment>();
  oldDay.steps.forEach((s, i) => {
    const fromId = i === 0 ? `start:${oldDay.id}` : oldDay.steps[i - 1].id;
    oldEdgeByIdentity.set(edgeIdentity(fromId, s.id), oldDay.routes[i]);
  });
  day.steps.forEach((s, i) => {
    const fromId = i === 0 ? `start:${day.id}` : day.steps[i - 1].id;
    const identity = edgeIdentity(fromId, s.id);
    const oldRoute = oldEdgeByIdentity.get(identity);
    const newRoute = day.routes[i];
    if (oldRoute && oldRoute.geometryResolved && edgeFingerprint(oldRoute) === edgeFingerprint(newRoute)) {
      map.set(identity, oldRoute);
    }
  });
  return map;
}

/**
 * Resolves every routable edge in `day`: reuses the cached geometry from
 * `oldDay` (if given) when that specific edge is unchanged since then,
 * otherwise fetches OSRM fresh (falling back to a straight-line-through-
 * waypoints estimate if OSRM fails). Non-routable edges (transit/ferry) are
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
 * day against the edit-start snapshot and only re-fetches OSRM for edges
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
