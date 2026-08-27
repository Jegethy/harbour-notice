import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { deviceRejection } from "@/lib/board/guard";
import { UNLOCK_COOKIE, readUnlockToken } from "@/lib/board/unlock";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BoardSnapshot } from "@/lib/types/database";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The board, as one tablet sees it right now.
 *
 * Polled rather than pushed, and that is a deliberate choice worth recording.
 *
 * Supabase Realtime would be the obvious answer, and the admin overview does use
 * it. But a browser subscription authenticates with the anon key, so realtime on
 * the tablets would mean granting anon SELECT on `staff` and `shift_assignments`
 * — the entire staff list and every photograph, readable by anyone who found the
 * URL. That is the one thing this app must not do, and no RLS policy narrow
 * enough to fix it exists, because the rows the board needs *are* the sensitive
 * rows.
 *
 * The other reason is that a websocket dies quietly. A board that stopped
 * updating three hours ago looks exactly like a board that is up to date, and
 * the failure is invisible until someone needs to know which nurse is on. A poll
 * that fails is a poll the client can count and say so about.
 *
 * A board changes twice a day and occasionally in between; a few seconds of
 * latency is not observable in a corridor. The cost is one small request per
 * tablet per interval, and the ETag makes the usual answer a 304 with no body.
 */

/**
 * The ETag deliberately excludes `at`.
 *
 * `at` is the server clock and changes on every single request; hashing it would
 * make every response a 200 with a full body and the ETag would do nothing at
 * all. The client keeps its own clock offset from the last full response, so it
 * stays accurate across a run of 304s.
 */
function etagFor(snapshot: BoardSnapshot): string {
  const { at: _at, ...stable } = snapshot;
  void _at;
  return `"${createHash("sha256").update(JSON.stringify(stable)).digest("base64url").slice(0, 27)}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ floor: string }> },
) {
  const { floor } = await params;

  const rejection = await deviceRejection(floor);
  if (rejection) return rejection;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("board_snapshot", { p_floor_slug: floor });

  if (error) {
    console.error("[board] snapshot failed", error);
    return NextResponse.json(
      { outcome: "ERROR", message: "Could not load the board." },
      { status: 503 },
    );
  }

  const snapshot = data as unknown as BoardSnapshot | { outcome: "NO_SUCH_FLOOR" };

  if (snapshot.outcome !== "OK") {
    return NextResponse.json(
      { outcome: "ERROR", message: "That floor no longer exists." },
      { status: 404 },
    );
  }

  // The remaining seconds of any editing window ride along with the board, so
  // the client's countdown is anchored to the server rather than to whatever
  // the tablet's clock believes. Without this a paused or slow tablet could
  // show an unlocked board that the server has already stopped accepting
  // writes for.
  const store = await cookies();
  const unlock = readUnlockToken(store.get(UNLOCK_COOKIE)?.value);
  const unlockedSeconds =
    unlock && unlock.floorSlug === floor
      ? Math.max(0, Math.round((unlock.expiresAt - Date.now()) / 1000))
      : 0;

  const body = { ...snapshot, unlocked_seconds: unlockedSeconds };
  const etag = etagFor(snapshot);

  // The unlock countdown must not suppress a 304 — it is derived from a cookie
  // the client already holds, and folding it into the ETag would turn every
  // second of an open editing window into a fresh full body.
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(body, {
    headers: { ETag: etag, "Cache-Control": "no-store" },
  });
}
