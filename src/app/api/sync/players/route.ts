import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { isAdminRequest } from "@/lib/adminAuth";
import type { PlayerTelemetry } from "@/lib/telemetry";

function safe(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Admin-only: every player's latest posted telemetry for one trip, for the
 *  Game Master dashboard's live map + player card grid. Scoped by `tripId` so
 *  travelers on a different trip never show up in each other's dashboards. */
export async function GET(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) {
    return NextResponse.json({ error: "missing_trip_id" }, { status: 400 });
  }

  const { blobs } = await list({ prefix: `players/${safe(tripId)}/` });
  const players = await Promise.all(
    blobs.map(async (blob) => {
      try {
        const res = await fetch(blob.url, { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as PlayerTelemetry;
      } catch {
        return null;
      }
    })
  );

  return NextResponse.json(players.filter((p): p is PlayerTelemetry => p !== null));
}
