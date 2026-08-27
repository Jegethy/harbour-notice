"use client";

import { BrandLogo } from "@/components/board/BrandLogo";
import type { BoardConnection } from "@/hooks/useBoardPoll";

/**
 * The masthead: the centre's logo, and which floor this is.
 *
 * Nothing else, by design. A clock, a date, a shift badge and a "Change staff"
 * button are all things the board's audience — residents, families, visiting
 * professionals crossing the floor — has no use for. They already know what day
 * it is; what they want is a face and a name. Every strip of chrome at the top
 * is height taken from the photographs, which are the entire point.
 *
 * The shift is still legible without a badge: the whole board turns from maroon
 * to indigo at 20:00.
 *
 * Two things do still appear here, and neither is chrome:
 *
 * - The stale warning, which is drawn only when the board has actually lost
 *   contact with the server. A wall display that has quietly stopped updating
 *   looks exactly like one that is correct, and that is the failure this app
 *   most needs to avoid being silent about.
 * - The unlock countdown and Done button, drawn only while somebody is midway
 *   through a handover. Editing controls belong on screen while editing.
 */
export function BoardHeader({
  floorName,
  connection,
  unlockedSeconds,
  onLockRequest,
}: {
  floorName: string;
  connection: BoardConnection;
  unlockedSeconds: number;
  onLockRequest: () => void;
}) {
  const unlocked = unlockedSeconds > 0;

  return (
    <header className="flex shrink-0 items-center gap-4 pb-3">
      <BrandLogo className="h-12 w-auto shrink-0 sm:h-14" />

      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-[var(--board-ink)] sm:text-3xl">
        {floorName}
      </h1>

      {connection === "stale" ? <StaleWarning /> : null}

      {unlocked ? (
        <button
          type="button"
          onClick={onLockRequest}
          className="flex shrink-0 items-center gap-2 rounded-full bg-brand-cream px-4 py-1.5 text-sm font-bold text-brand-primary"
        >
          Done
          <span className="tabular-nums opacity-70">{formatCountdown(unlockedSeconds)}</span>
        </button>
      ) : null}
    </header>
  );
}

/**
 * Shown once the board has failed to reach the server several times running.
 *
 * Cream on the board background rather than brand red: red on maroon measures
 * 1.8:1, which is close to invisible at corridor distance — see globals.css.
 */
function StaleWarning() {
  return (
    <span
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-primary"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-accent" />
      Not updating
    </span>
  );
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
