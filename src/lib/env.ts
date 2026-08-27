/**
 * Environment access with loud failures.
 *
 * A board that boots with a missing key should fail with a legible message,
 * not sit blank on a corridor wall until somebody thinks to check.
 *
 * These are functions rather than module constants on purpose: constants are
 * evaluated at import time, which means `next build` would throw on a machine
 * without credentials. As functions they throw only when something actually
 * tries to reach Supabase.
 *
 * NEXT_PUBLIC_ values are still inlined at build time — that depends on the
 * literal `process.env.NEXT_PUBLIC_X` reference, not on where it sits.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Server-only. Never import this from a client component. */
export function serviceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
