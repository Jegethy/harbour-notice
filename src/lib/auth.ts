import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The authorisation boundary for the admin panel.
 *
 * Call this at the top of every admin page and every server action, even though
 * proxy.ts already redirects. The proxy is a routing convenience; a matcher edit
 * or a moved route can silently drop its coverage, and a server action is
 * reachable by anyone who can post to its endpoint regardless of which page
 * rendered the form.
 *
 * getUser() revalidates the token with Supabase rather than trusting a cookie.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  return user;
}
