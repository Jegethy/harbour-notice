"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { msUntilNextHandover } from "@/lib/board/shift";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the admin overview live without duplicating the page's query.
 *
 * The page is a server component that already knows how to assemble "who is on
 * duty right now" across every floor. Rather than reimplementing that read in
 * the browser, this subscribes to the table and calls router.refresh(), which
 * re-runs the server component and streams the new markup in. One query, one
 * place, and no risk of the live view and the first paint disagreeing.
 *
 * Realtime is used here and deliberately not on the corridor tablets: this page
 * is behind a login, so the browser holding an authenticated session may read
 * these tables. A tablet on a wall may not — see the note in
 * app/api/board/[floor]/route.ts.
 */
export function DutyRefresher() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [live, setLive] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("admin-duty-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_assignments" },
        () => router.refresh(),
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  // A backstop poll, and a tighter one when the socket is down. A dropped
  // websocket on care-home wifi is ordinary; an overview that quietly stopped
  // updating is not something anyone would notice from looking at it.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), live ? 60_000 : 15_000);
    return () => window.clearInterval(id);
  }, [router, live]);

  // Refresh as the shift turns over, so this page changes at the same moment
  // the boards do rather than up to a minute later.
  useEffect(() => {
    const id = window.setTimeout(() => router.refresh(), msUntilNextHandover() + 1000);
    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
        live
          ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
          : "border-neutral-dark/20 bg-neutral-dark/5 text-neutral-dark/60"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${live ? "bg-status-ok" : "bg-neutral-dark/40"}`}
      />
      {live ? "Live" : "Reconnecting"}
    </span>
  );
}
