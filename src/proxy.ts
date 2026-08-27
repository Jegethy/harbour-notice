import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

/**
 * Next 16 renamed the `middleware` convention to `proxy`. Runs on Node.
 *
 * Scoped to /admin only, deliberately: the corridor boards must never be gated
 * behind a login, and /api/board authenticates with its own device cookie
 * instead.
 *
 * This handles session refresh and the signed-in/signed-out redirects. It is
 * NOT the authorisation boundary — the Next docs warn that a matcher change or
 * a moved route can silently remove proxy coverage, so every admin page and
 * every server action calls requireAdmin() for itself.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
