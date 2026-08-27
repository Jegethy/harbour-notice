"use client";

import { useCallback, useState } from "react";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardSection, type SlotTarget } from "@/components/board/BoardSection";
import { PinPad } from "@/components/board/PinPad";
import { SwapModal } from "@/components/board/SwapModal";
import { useBoardPoll } from "@/hooks/useBoardPoll";
import { ROLES } from "@/lib/board/roles";
import type { BoardSnapshot } from "@/lib/types/database";

/**
 * The whole wall display.
 *
 * The interaction has one idea behind it: a handover is not one swap. At 20:00
 * the nurse changes, both seniors change and three assistants change, so asking
 * for the PIN on every tap would mean typing it six times in front of whoever
 * is in the corridor — and the predictable end of that is a PIN on a sticky note
 * beside the tablet. A correct PIN opens a ten-minute editing window instead,
 * the board says plainly that it is unlocked and for how long, and there is a
 * Done button to close it the moment the handover is finished.
 *
 * Tapping a photograph is still the way in, as it should be — it is the only
 * affordance on the screen. When the board is locked a tap asks for the PIN and
 * remembers which face was pressed, so entering it drops straight into the right
 * swap rather than back to the board with nothing to show for it.
 */
export function BoardClient({ initial }: { initial: BoardSnapshot }) {
  const floor = initial.floor.slug;
  const { snapshot, connection, now, unlockedSeconds, refresh, setUnlockedSeconds } =
    useBoardPoll(floor, initial);

  const [pinOpen, setPinOpen] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [target, setTarget] = useState<SlotTarget | null>(null);

  /** Remembered across the PIN prompt so a tap lands where it was aimed. */
  const [pendingTarget, setPendingTarget] = useState<SlotTarget | null>(null);

  const unlocked = unlockedSeconds > 0;

  const askForPin = useCallback((next: SlotTarget | null) => {
    setPendingTarget(next);
    setPinError(null);
    setPinOpen(true);
  }, []);

  const selectSlot = useCallback(
    (next: SlotTarget) => {
      if (unlocked) setTarget(next);
      else askForPin(next);
    },
    [unlocked, askForPin],
  );

  async function submitPin(pin: string) {
    setPinPending(true);
    setPinError(null);

    try {
      const response = await fetch(`/api/board/${floor}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { outcome?: string; message?: string; unlocked_seconds?: number }
        | null;

      if (!response.ok || payload?.outcome !== "UNLOCKED") {
        setPinError(payload?.message ?? "That PIN was not recognised.");
        return;
      }

      setUnlockedSeconds(payload.unlocked_seconds ?? 0);
      setPinOpen(false);

      // Straight into the swap they were aiming for. Closing back to the board
      // and making them find the same photograph again is the kind of small
      // friction that gets an app abandoned at the busiest moment of the day.
      if (pendingTarget) setTarget(pendingTarget);
      setPendingTarget(null);
    } catch {
      setPinError("Could not reach the server. Please try again.");
    } finally {
      setPinPending(false);
    }
  }

  async function lock() {
    setUnlockedSeconds(0);
    setTarget(null);
    try {
      await fetch(`/api/board/${floor}/unlock`, { method: "DELETE" });
    } catch {
      // The window expires on its own within ten minutes regardless, and the
      // server is the thing that decides. Nothing useful to say here.
    }
  }

  /** The window closed underneath an open modal. Ask again, same target. */
  const handleLocked = useCallback(() => {
    setUnlockedSeconds(0);
    setTarget((current) => {
      if (current) askForPin(current);
      return null;
    });
  }, [askForPin, setUnlockedSeconds]);

  const night = snapshot.shift === "NIGHT";
  const empty = snapshot.slots.length === 0;

  return (
    <div
      className="flex h-dvh w-full flex-col px-3 py-3 sm:px-5 sm:py-4"
      // Day and night are the same layout in two palettes. Custom properties
      // rather than conditional classes so every child — cards, modals, the PIN
      // pad — follows the shift without any of them knowing which shift it is.
      style={
        night
          ? {
              "--board-bg": "var(--color-night-primary)",
              "--board-surface": "var(--color-night-deep)",
              "--board-surface-2": "var(--color-night-light)",
              "--board-line": "color-mix(in srgb, var(--color-brand-cream) 22%, transparent)",
              "--board-ink": "var(--color-brand-cream)",
              "--board-ink-dim": "var(--color-cream-dim)",
              background: "var(--color-night-primary)",
            } as React.CSSProperties
          : ({
              "--board-bg": "var(--color-brand-primary)",
              "--board-surface": "var(--color-brand-deep)",
              "--board-surface-2": "var(--color-brand-light)",
              "--board-line": "color-mix(in srgb, var(--color-brand-cream) 22%, transparent)",
              "--board-ink": "var(--color-brand-cream)",
              "--board-ink-dim": "var(--color-cream-dim)",
              background: "var(--color-brand-primary)",
            } as React.CSSProperties)
      }
    >
      <BoardHeader
        floorName={snapshot.floor.name}
        shift={snapshot.shift}
        now={now}
        connection={connection}
        unlockedSeconds={unlockedSeconds}
        onUnlockRequest={() => askForPin(null)}
        onLockRequest={() => void lock()}
      />

      {empty && !unlocked ? (
        <EmptyBoard onStart={() => askForPin(null)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
          {ROLES.map((role) => (
            <BoardSection
              key={role}
              role={role}
              slots={snapshot.slots.filter((slot) => slot.role === role)}
              unlocked={unlocked}
              onSelect={selectSlot}
            />
          ))}
        </div>
      )}

      <PinPad
        open={pinOpen}
        pending={pinPending}
        error={pinError}
        onSubmit={(pin) => void submitPin(pin)}
        onCancel={() => {
          setPinOpen(false);
          setPendingTarget(null);
          setPinError(null);
        }}
      />

      <SwapModal
        floor={floor}
        target={target}
        onClose={() => setTarget(null)}
        onChanged={() => void refresh()}
        onLocked={handleLocked}
      />
    </div>
  );
}

/**
 * Nobody on duty at all.
 *
 * Distinct from a short-staffed board on purpose. Three empty sections stacked
 * up read as a broken screen; one sentence explaining that nothing has been
 * recorded yet, with the way to fix it, reads as a system waiting for input.
 */
function EmptyBoard({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 text-center">
      <p className="text-balance text-2xl font-bold text-[var(--board-ink)] sm:text-3xl">
        Nobody is recorded on duty for this shift yet
      </p>
      <p className="max-w-md text-balance text-[var(--board-ink-dim)]">
        Tap below and enter the PIN to add the nurse in charge and the care team.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-2xl bg-brand-cream px-8 py-4 text-xl font-bold text-brand-primary active:scale-[0.98]"
      >
        Add staff
      </button>
    </div>
  );
}
