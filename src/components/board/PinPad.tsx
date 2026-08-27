"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The 4-digit PIN pad.
 *
 * Draws its own keypad rather than using an <input inputmode="numeric">. A
 * tablet in lock-task mode either has no system keyboard or has one whose
 * microphone and settings keys are a breakout route off the board, so the
 * digits have to be part of the page.
 *
 * Submits automatically on the fourth digit. Asking someone to press OK after
 * typing four digits adds a step whose only purpose is to let them change their
 * mind about a number they have already decided on, and the wrong-PIN path
 * costs one re-entry either way.
 */
export function PinPad({
  open,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [digits, setDigits] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setDigits("");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function press(digit: string) {
    if (pending || digits.length >= 4) return;

    const next = digits + digit;

    if (next.length < 4) {
      setDigits(next);
      return;
    }

    // Clear on submit rather than after a rejection comes back. The alternative
    // is resetting from an effect that watches the error, which is a cascading
    // render — and it leaves four digits sitting on screen that are already
    // known to be wrong. The dots stay filled while `pending` is true, so this
    // is invisible on the way in and the pad is empty and ready on the way out.
    setDigits("");
    onSubmit(next);
  }

  // Four while an attempt is in flight: the digits have been handed off and
  // cleared, but from the outside the entry is still complete and being checked.
  const filledDots = pending ? 4 : digits.length;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(24rem,90vw)] rounded-3xl bg-[var(--board-surface)] p-0 text-[var(--board-ink)] backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-5 p-6">
        <header className="text-center">
          <h2 className="text-2xl font-bold">Enter PIN</h2>
          <p className="mt-1 text-sm text-[var(--board-ink-dim)]">
            Ask the nurse in charge if you do not know it.
          </p>
        </header>

        <div className="flex justify-center gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`h-4 w-4 rounded-full border-2 border-[var(--board-ink-dim)] transition-colors ${
                index < filledDots ? "bg-[var(--board-ink)]" : "bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Announced to a screen reader without ever showing the digits. */}
        <p className="sr-only" role="status">
          {filledDots} of 4 digits entered
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-brand-cream px-4 py-2.5 text-center text-sm font-bold text-brand-primary"
          >
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <Key key={digit} onPress={() => press(digit)} disabled={pending}>
              {digit}
            </Key>
          ))}

          <Key onPress={onCancel} disabled={pending} muted>
            Cancel
          </Key>

          <Key onPress={() => press("0")} disabled={pending}>
            0
          </Key>

          <Key
            onPress={() => setDigits((value) => value.slice(0, -1))}
            disabled={pending || digits.length === 0}
            muted
            label="Delete last digit"
          >
            <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6 fill-none stroke-current stroke-2">
              <path
                d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1ZM18 9l-5 6M13 9l5 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Key>
        </div>

        {pending ? (
          <p role="status" className="text-center text-sm font-semibold text-[var(--board-ink-dim)]">
            Checking…
          </p>
        ) : null}
      </div>
    </dialog>
  );
}

/**
 * A key.
 *
 * min-height rather than padding: these are pressed by people wearing gloves,
 * standing at arm's length from a wall, and 4rem clears the 9mm target the
 * accessibility guidance asks for on every tablet this will run on.
 */
function Key({
  children,
  onPress,
  disabled,
  muted = false,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className={`min-h-16 rounded-2xl text-2xl font-bold transition-colors active:scale-95 disabled:opacity-40 ${
        muted
          ? "bg-transparent text-[var(--board-ink-dim)] text-base"
          : "bg-[var(--board-surface-2)] text-[var(--board-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
