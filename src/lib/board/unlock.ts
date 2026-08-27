import "server-only";

import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import { equals } from "@/lib/board/device";

/**
 * The 4-digit swap PIN, and the short editing session it opens.
 *
 * Two things are going on here, and they answer different threats.
 *
 * The PIN itself is stored as a salted scrypt hash. Four digits is 10,000
 * possibilities, so hashing is not what stops someone guessing it — the rate
 * limit on /api/board/unlock is. What the hash buys is that a database backup,
 * a support session, or a leaked dump does not hand over the number staff are
 * typing on the wall every evening.
 *
 * The unlock cookie is the other half. Handover is not one swap: at 20:00 the
 * nurse, two seniors and three assistants all change. Asking for the PIN on
 * every tap would mean typing it six times in front of a corridor of people,
 * and the predictable response to that is a PIN taped to the wall beside the
 * tablet. So a correct PIN opens a short editing window instead, the board says
 * plainly that it is unlocked and for how long, and there is a Done button to
 * close it early.
 *
 * The window is bound to the floor it was opened on, so unlocking the ground
 * floor board does not silently authorise writes to the first floor.
 */

/**
 * promisify() resolves to the three-argument overload of scrypt and drops the
 * one that takes options, so the cost parameter would be silently ignored.
 * Asserting the signature keeps N meaningful.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export const UNLOCK_COOKIE = "harbour_board_unlock";

/**
 * Ten minutes.
 *
 * Long enough for a whole handover without retyping, short enough that a tablet
 * left unlocked and walked away from re-locks itself before the corridor is
 * empty. The board shows the countdown rather than expiring silently.
 */
export const UNLOCK_MAX_AGE = 10 * 60;

/** scrypt cost. 2^15 is a few hundred ms here, which is fine for a PIN check. */
const SCRYPT_N = 32768;
const KEY_LENGTH = 32;

function unlockSecret(): string {
  // Falls back to the pairing token so a single-site install has one secret to
  // manage. Set BOARD_UNLOCK_SECRET separately if you want re-pairing every
  // tablet and invalidating open edit windows to be different operations.
  const value =
    process.env.BOARD_UNLOCK_SECRET?.trim() || process.env.BOARD_SETUP_TOKEN?.trim();

  if (!value) {
    throw new Error(
      "Neither BOARD_UNLOCK_SECRET nor BOARD_SETUP_TOKEN is set. Shift swaps cannot be authorised.",
    );
  }
  return value;
}

/** A PIN is exactly four digits. Nothing else is accepted anywhere. */
export function isValidPinShape(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** `scrypt$<N>$<salt-base64>$<hash-base64>` — self-describing, so N can change later. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt, KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * Constant-time PIN check.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt
 * settings row should lock the board, not 500 it.
 */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;

  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost < 1024) return false;

  try {
    const salt = Buffer.from(parts[2], "base64");
    const expected = Buffer.from(parts[3], "base64");
    const derived = await scryptAsync(pin, salt, expected.length, { N: cost });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", unlockSecret()).update(payload).digest("base64url");
}

/** Mint an editing window for one floor. */
export function mintUnlockToken(floorSlug: string): string {
  const expiresAt = Date.now() + UNLOCK_MAX_AGE * 1000;
  const payload = `${floorSlug}.${expiresAt}`;
  return `v1.${payload}.${sign(payload)}`;
}

export interface UnlockState {
  floorSlug: string;
  expiresAt: number;
}

/** Read an editing window, or null if it is missing, forged or expired. */
export function readUnlockToken(token: string | undefined | null): UnlockState | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  const [, floorSlug, expiresAt, signature] = parts;

  if (!equals(signature, sign(`${floorSlug}.${expiresAt}`))) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;

  return { floorSlug, expiresAt: expiry };
}
