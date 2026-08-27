"use client";

import { useActionState, useRef, useState } from "react";
import { setPinAction, type ActionState } from "@/app/admin/actions";

/**
 * Set the PIN staff type on the tablets.
 *
 * Typed twice, and never displayed back. There is no recovery path that does
 * not involve walking to a computer: get this wrong and every tablet refuses
 * every swap until somebody returns to this screen, quite possibly at 20:00 on
 * a Sunday.
 */
export function PinForm({ setAt }: { setAt: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await setPinAction(previous, formData);
      if (result.notice) formRef.current?.reset();
      return result;
    },
    {},
  );

  // The weak-PIN warning is a speed bump, not a wall: submitting again with
  // this set goes through. A care home that wants 1111 on an internal board can
  // have it — refusing outright just gets the real PIN written on the wall.
  const [acceptWeak, setAcceptWeak] = useState(false);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="accept_weak" value={String(acceptWeak)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <PinInput name="pin" label="New PIN" />
        <PinInput name="pin_confirm" label="Type it again" />
      </div>

      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {state.error}
          {state.error.includes("same digit") && !acceptWeak ? (
            <button
              type="button"
              onClick={() => setAcceptWeak(true)}
              className="ml-2 underline"
            >
              Use it anyway
            </button>
          ) : null}
        </div>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border-2 border-status-ok bg-status-ok/10 px-4 py-3 text-sm font-semibold text-status-ok"
        >
          {state.notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-primary px-6 py-3 text-base font-bold text-brand-cream transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : setAt ? "Change PIN" : "Set PIN"}
        </button>

        <p className="text-sm text-neutral-dark/60">
          {setAt
            ? `Last changed ${new Date(setAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
            : "No PIN has been set yet — the tablets will refuse every swap until you set one."}
        </p>
      </div>
    </form>
  );
}

function PinInput({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="password"
        name={name}
        required
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="off"
        className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-2xl tracking-[0.5em] outline-none focus:border-brand-primary"
      />
    </label>
  );
}
