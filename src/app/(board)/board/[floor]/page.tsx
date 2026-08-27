import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BoardClient } from "@/components/board/BoardClient";
import { mayAccessFloor, pairedFloor } from "@/lib/board/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BoardSnapshot } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "On Duty — Harbour Care Centre",
  robots: { index: false, follow: false },
};

/**
 * One floor's board.
 *
 * Rendered on the server with the first snapshot already in place, so the wall
 * shows the right faces on the first paint rather than a loading state that
 * somebody walking past would read as a broken screen. The client takes over
 * polling from there.
 */
export default async function BoardPage({ params }: PageProps<"/board/[floor]">) {
  const { floor } = await params;

  if (!(await mayAccessFloor(floor))) {
    // Unpaired tablets get the setup screen; a tablet paired to a different
    // floor gets nothing, because it should not be showing this board at all.
    redirect((await pairedFloor()) === null ? "/setup" : "/");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("board_snapshot", { p_floor_slug: floor });

  if (error) {
    console.error("[board] initial snapshot failed", error);
    return <BoardUnavailable />;
  }

  const snapshot = data as unknown as BoardSnapshot | { outcome: "NO_SUCH_FLOOR" };

  if (snapshot.outcome !== "OK") {
    notFound();
  }

  return <BoardClient initial={snapshot} />;
}

/**
 * The database is unreachable.
 *
 * Deliberately says nothing about who might be on duty. A board that guesses, or
 * that keeps yesterday's faces on the wall because it cannot check, is worse
 * than one that admits it does not know — somebody looking for the nurse in
 * charge needs to go and ask, not read a stale screen with confidence.
 */
function BoardUnavailable() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-brand-primary px-8 text-center">
      <h1 className="text-balance text-3xl font-bold text-brand-cream">
        The duty board is unavailable
      </h1>
      <p className="max-w-md text-balance text-lg text-cream-dim">
        The server could not be reached. Please ask the nurse in charge directly, and let
        the administrator know.
      </p>
    </div>
  );
}
