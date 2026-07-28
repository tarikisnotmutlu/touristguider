import { NextResponse } from "next/server";
import { get, put } from "@vercel/blob";

function blobPathname(id: string) {
  // Keep ids to a safe charset since they map straight onto a blob path.
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return `trips/${safeId}.json`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await get(blobPathname(id), { access: "public" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const trip = await new Response(result.stream).json();
  return NextResponse.json(trip);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await req.json();

  if (!trip || typeof trip !== "object" || trip.id !== id) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await put(blobPathname(id), JSON.stringify(trip), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return NextResponse.json({ ok: true });
}
