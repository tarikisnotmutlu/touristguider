import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tg_admin";

/** Checked server-side on every admin-only route — the cookie is only ever
 *  set by /api/admin/auth after a correct PIN, so its mere presence is the
 *  whole "session". Deliberately simple: this is a personal trip-planning
 *  toy, not a system that needs to survive a real attacker. */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === "1";
}
