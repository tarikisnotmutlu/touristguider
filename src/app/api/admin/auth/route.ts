import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminAuth";

/** Simple PIN gate — process.env.ADMIN_PIN never reaches the client bundle
 *  since this check happens server-side; a correct PIN just sets a plain
 *  session cookie (see adminAuth.ts for why "plain" is fine here). */
export async function POST(req: Request) {
  const { pin } = (await req.json()) as { pin?: string };
  const expected = process.env.ADMIN_PIN;

  if (!expected) {
    return NextResponse.json({ error: "admin_pin_not_configured" }, { status: 500 });
  }
  if (pin !== expected) {
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
