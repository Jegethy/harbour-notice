"use client";

import { useActionState } from "react";
import { signInAction, type ActionState } from "@/app/admin/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-neutral-dark">Email address</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          autoFocus
          className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-lg text-neutral-dark outline-none focus:border-brand-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-neutral-dark">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-lg text-neutral-dark outline-none focus:border-brand-primary"
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-brand-primary px-6 py-3.5 text-lg font-bold text-brand-cream transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
