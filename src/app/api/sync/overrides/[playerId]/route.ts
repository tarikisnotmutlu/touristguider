import { NextResponse } from "next/server";
import { get, put, del } from "@vercel/blob";
import { isAdminRequest } from "@/lib/adminAuth";
import { genId } from "@/lib/id";
import type { GmAction, GmOverride } from "@/lib/telemetry";

const GM_ACTIONS: GmAction[] = ["full_heal", "send_water", "gift_cat", "cure_fatigue", "reset_stats"];

function blobPathname(playerId: string) {
  const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `overrides/${safeId}.json`;
}

async function readOverrides(playerId: string): Promise<GmOverride[]> {
  const result = await get(blobPathname(playerId), { access: "public" });
  if (!result || result.statusCode !== 200) return [];
  try {
    return (await new Response(result.stream).json()) as GmOverride[];
  } catch {
    return [];
  }
}

/** A traveler's client polls this every ~15s for GM actions queued against
 *  their own playerId (see useSyncTelemetry) — no admin auth here, since
 *  reading your own pending overrides is the traveler-side half of this
 *  flow, not a Game Master action.
 *
 *  Consumes (clears) whatever it returns in the same request, rather than
 *  leaving that to a follow-up DELETE call — a background tab's throttled
 *  timers tend to fire in a catch-up burst right after it's foregrounded,
 *  and a separate GET-then-apply-then-DELETE round trip left a window
 *  where two poll ticks landing close together could both read the same
 *  pending override before either had cleared it, double-applying it. */
export async function GET(_req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const overrides = await readOverrides(playerId);
  if (overrides.length > 0) {
    await del(blobPathname(playerId)).catch(() => {
      // Nothing pending to delete — fine.
    });
  }
  return NextResponse.json(overrides);
}

/** Game Master only: queue an action for a specific player. Appends rather
 *  than overwrites so a GM mashing two buttons in a row doesn't drop one. */
export async function POST(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { playerId } = await params;
  const { action } = (await req.json()) as { action?: GmAction };
  if (!action || !GM_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const existing = await readOverrides(playerId);
  const next: GmOverride[] = [...existing, { id: genId(), action, createdAt: Date.now() }];

  await put(blobPathname(playerId), JSON.stringify(next), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return NextResponse.json({ ok: true });
}
