"use client";

import type { BoardConnection } from "@/hooks/useBoardPoll";
import { formatBoardDate, formatBoardTime, shiftHours, shiftLabel, type Shift } from "@/lib/board/shift";

/**
 * The masthead: where you are, when you are, and who is in charge of the board.
 *
 * The shift badge and the whole page tint move together at handover, so the
 * board announces the changeover to somebody walking past before they read a
 * single name. That is the point of the colour change — a board still showing
 * the day team at half nine at night is a safety problem, and it should be
 * visible as one from the end of the corridor.
 */
export function BoardHeader({
  floorName,
  shift,
  now,
  connection,
  unlockedSeconds,
  onUnlockRequest,
  onLockRequest,
}: {
  floorName: string;
  shift: Shift;
  now: Date;
  connection: BoardConnection;
  unlockedSeconds: number;
  onUnlockRequest: () => void;
  onLockRequest: () => void;
}) {
  const unlocked = unlockedSeconds > 0;

  return (
    <header className="flex shrink-0 items-end justify-between gap-4 pb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-bold text-[var(--board-ink)] sm:text-3xl">
            {floorName}
          </h1>
          <ShiftBadge shift={shift} />
        </div>

        <p className="mt-0.5 truncate text-sm text-[var(--board-ink-dim)] sm:text-base">
          {formatBoardDate(now)} · {shiftHours(shift)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2.5">
          {connection === "stale" ? <StaleWarning /> : null}

          <time
            className="text-3xl font-bold tabular-nums leading-none text-[var(--board-ink)] sm:text-4xl"
            dateTime={now.toISOString()}
          >
            {formatBoardTime(now)}
          </time>
        </div>

        {unlocked ? (
          <button
            type="button"
            onClick={onLockRequest}
            className="flex items-center gap-2 rounded-full bg-brand-cream px-4 py-1.5 text-sm font-bold text-brand-primary"
          >
            Done
            <span className="tabular-nums opacity-70">{formatCountdown(unlockedSeconds)}</span>
          </button>
        ) : (
          /* A way in that does not depend on there being a photo to tap. An
             empty board is exactly when somebody needs to add the first person,
             and with no cards on screen there would otherwise be nothing to
             press. */
          <button
            type="button"
            onClick={onUnlockRequest}
            className="rounded-full border border-[var(--board-line)] px-4 py-1.5 text-sm font-semibold text-[var(--board-ink-dim)]"
          >
            Change staff
          </button>
        )}
      </div>
    </header>
  );
}

function ShiftBadge({ shift }: { shift: Shift }) {
  return (
    <span className="shrink-0 rounded-full bg-[var(--board-surface-2)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--board-ink)]">
      {shiftLabel(shift)}
    </span>
  );
}

/**
 * Shown once the board has failed to reach the server several times running.
 *
 * A wall display that has quietly stopped updating is the worst outcome here:
 * it looks authoritative and is wrong. Saying so on screen costs a strip of
 * cream and means nobody trusts a stale board by accident.
 */
function StaleWarning() {
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-primary"
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
