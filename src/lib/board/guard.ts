import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  isPairingConfigured,
  isPairingRequired,
  readDeviceToken,
} from "@/lib/board/device";
import { UNLOCK_COOKIE, readUnlockToken } from "@/lib/board/unlock";
import { createClient } from "@/lib/supabase/server";

/**
 * Which floor is this tablet paired to?
 *
 * Returns "*" when pairing is not required (development with no token set), so
 * a fresh clone can open any board without setup. Null means unpaired.
 */
export async function pairedFloor(): Promise<string | null> {
  if (!isPairingRequired()) return "*";
  if (!isPairingConfigured()) return null;

  const store = await cookies();
  return readDeviceToken(store.get(DEVICE_COOKIE)?.value);
}

async function isAdminSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/** Does this request carry the right to read/write the given floor's board? */
export async function mayAccessFloor(slug: string): Promise<boolean> {
  const floor = await pairedFloor();
  if (floor === "*" || floor === slug) return true;

  // A signed-in admin is a stronger credential than a paired tablet, so accept
  // that too. Without it, the admin preview of a board could not be opened from
  // a laptop, which is where support work actually happens.
  //
  // The await is load-bearing — do NOT collapse this back to
  // `return isAdminSession()`. An un-awaited call returns a Promise, and a
  // Promise is always truthy as a raw value. The production optimiser reads the
  // tail expression, concludes this function can only ever resolve truthy, and
  // then dead-code-eliminates the failure branch of every caller: with that
  // version, deviceRejection() below compiled down to an unconditional
  // `return null`, which silently opened every board endpoint to the internet.
  // It type-checks and it builds clean; the only way to catch it is to make the
  // request. Resolving into a boolean first keeps the analysis honest.
  const allowed = await isAdminSession();
  return allowed;
}

/**
 * Guard for board API routes. Returns a response to return early with, or null
 * to continue.
 *
 * The failure modes are reported separately on purpose. An unpaired tablet
 * needs someone to walk over and run setup; a missing server token is a
 * deployment fault; a tablet paired to the wrong floor is a configuration
 * mistake. Collapsing them into one "unauthorised" sends people hunting for the
 * wrong thing.
 */
export async function deviceRejection(slug: string): Promise<NextResponse | null> {
  if (!isPairingRequired()) return null;

  if (!isPairingConfigured()) {
    console.error(
      "[board] BOARD_SETUP_TOKEN is not set. Refusing board requests rather than publishing the staff list.",
    );
    return NextResponse.json(
      {
        outcome: "ERROR",
        message: "The noticeboard is not configured on the server.",
      },
      { status: 503 },
    );
  }

  if (await mayAccessFloor(slug)) return null;

  return NextResponse.json(
    {
      outcome: "ERROR",
      message: "This tablet is not set up for this floor.",
    },
    { status: 401 },
  );
}

/**
 * Is there an open editing window for this floor?
 *
 * Checked on the server for every write. The client also tracks the countdown
 * so it can grey the board out and re-prompt, but that is presentation — this
 * is the check that decides.
 */
export async function unlockedFor(slug: string): Promise<boolean> {
  const store = await cookies();
  const state = readUnlockToken(store.get(UNLOCK_COOKIE)?.value);
  return state !== null && state.floorSlug === slug;
}

/** Trim a submitted string, or null if it is absent, blank or over-long. */
export function cleanField(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}
