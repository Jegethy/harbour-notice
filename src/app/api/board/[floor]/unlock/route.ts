import { NextResponse } from "next/server";
import { deviceRejection } from "@/lib/board/guard";
import { checkLimit, clearLimit, clientKey } from "@/lib/board/rate-limit";
import {
  UNLOCK_COOKIE,
  UNLOCK_MAX_AGE,
  isValidPinShape,
  mintUnlockToken,
  verifyPin,
} from "@/lib/board/unlock";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attempt limiting.
 *
 * This is what actually protects a 4-digit PIN. Ten thousand combinations falls
 * to a script in seconds if the endpoint answers as fast as it can, so the
 * limit is deliberately tight — eight tries in fifteen minutes. Real staff
 * mistype once and get in on the second go; a script gets 8 guesses an hour out
 * of 10,000 and gives up.
 *
 * A correct PIN clears the counter, so a genuine fumble at handover does not
 * eat into the allowance for the rest of the shift.
 */
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    // A tunnel terminates TLS, so tablets always speak https in production.
    // Left off in development so the board works over plain http on a laptop.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

/** Open an editing window on this floor. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ floor: string }> },
) {
  const { floor } = await params;

  const rejection = await deviceRejection(floor);
  if (rejection) return rejection;

  const key = clientKey(request, `unlock:${floor}`);
  const limit = checkLimit(key, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS);
  if (limit.limited) {
    return NextResponse.json(
      {
        outcome: "RATE_LIMITED",
        message: "Too many incorrect PINs. Please wait, or use the admin panel.",
        retry_after: limit.retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let pin: unknown;
  try {
    pin = ((await request.json()) as { pin?: unknown } | null)?.pin;
  } catch {
    return NextResponse.json({ outcome: "ERROR", message: "Invalid request." }, { status: 400 });
  }

  if (typeof pin !== "string" || !isValidPinShape(pin)) {
    return NextResponse.json(
      { outcome: "WRONG_PIN", message: "Enter the 4-digit PIN." },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data: hash, error } = await supabase.rpc("swap_pin_hash");

  if (error) {
    console.error("[board] could not read the swap PIN", error);
    return NextResponse.json(
      { outcome: "ERROR", message: "Could not check the PIN. Please try again." },
      { status: 503 },
    );
  }

  if (!hash) {
    // No PIN has ever been set. Refusing is the safe answer: the alternative —
    // letting anyone through until someone remembers to set one — is a board
    // that is unprotected precisely for as long as nobody has noticed.
    return NextResponse.json(
      {
        outcome: "NO_PIN",
        message: "No PIN has been set yet. Set one in the admin panel.",
      },
      { status: 503 },
    );
  }

  if (!(await verifyPin(pin, hash))) {
    return NextResponse.json(
      { outcome: "WRONG_PIN", message: "That PIN was not recognised." },
      { status: 401 },
    );
  }

  clearLimit(key);

  const response = NextResponse.json({
    outcome: "UNLOCKED",
    unlocked_seconds: UNLOCK_MAX_AGE,
  });

  response.cookies.set(UNLOCK_COOKIE, mintUnlockToken(floor), {
    ...cookieOptions(),
    maxAge: UNLOCK_MAX_AGE,
  });

  return response;
}

/**
 * Close the editing window early.
 *
 * The "Done" button on the board. Worth having as an explicit action: after a
 * handover the tablet goes back on the wall, and staff should be able to leave
 * it locked rather than trusting the timeout to run out behind them.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ floor: string }> },
) {
  const { floor } = await params;

  const rejection = await deviceRejection(floor);
  if (rejection) return rejection;

  const response = NextResponse.json({ outcome: "LOCKED" });
  response.cookies.set(UNLOCK_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
