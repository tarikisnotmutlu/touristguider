import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { isAdminRequest } from "@/lib/adminAuth";
import type { PlayerTelemetry } from "@/lib/telemetry";

/** Admin-only: every player's latest posted telemetry, for the Game Master
 *  dashboard's live map + player card grid. */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { blobs } = await list({ prefix: "players/" });
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
