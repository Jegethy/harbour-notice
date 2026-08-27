"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Browser client, anon key. Used by the admin panel for realtime subscriptions
 * and signed-in reads.
 *
 * The corridor boards do NOT use this. RLS denies anon everything, and a tablet
 * on a wall is reachable by anyone walking past — board reads and handover
 * swaps go through server routes holding the service-role key instead.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
