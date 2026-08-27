import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * This exists so a wall-mounted tablet can show the board and record a handover
 * swap without holding any database credentials of its own, and so the admin
 * panel can write to the private photo bucket. Confine its use to route
 * handlers under /api and to server actions that have already called
 * requireAdmin().
 *
 * The `server-only` import above turns any client-side import into a build
 * error rather than a leaked key.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), serviceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
