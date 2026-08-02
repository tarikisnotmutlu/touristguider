import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import type { PlayerTelemetry } from "@/lib/telemetry";

function safe(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function blobPathname(tripId: string, playerId: string) {
  return `players/${safe(tripId)}/${safe(playerId)}.json`;
}

/**
 * Telemetry ingest — a traveler's client posts its own {lat, lng, stats}
 * here roughly every 20s (see useSyncTelemetry). Mocked on Vercel Blob for
 * now (one JSON file per player, overwritten each post); swapping this for
 * Supabase/Vercel KV later is a one-file change since the shape here is
 * already the row/record shape either would store.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<PlayerTelemetry>;

  if (!body || typeof body.playerId !== "string" || !body.playerId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.tripId !== "string" || !body.tripId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const telemetry: PlayerTelemetry = {
    playerId: body.playerId,
    tripId: body.tripId,
    playerName: typeof body.playerName === "string" && body.playerName ? body.playerName : "Traveler",
    lat: typeof body.lat === "number" ? body.lat : null,
    lng: typeof body.lng === "number" ? body.lng : null,
    stats: {
      hunger: body.stats?.hunger ?? 0,
      thirst: body.stats?.thirst ?? 0,
      catCount: body.stats?.catCount ?? 0,
      fatigueLevel: body.stats?.fatigueLevel ?? 0,
    },
    timestamp: Date.now(),
  };

  await put(blobPathname(telemetry.tripId, telemetry.playerId), JSON.stringify(telemetry), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return NextResponse.json({ ok: true });
}
