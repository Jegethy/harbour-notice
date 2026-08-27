import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Device pairing for a corridor tablet.
 *
 * The board is publicly reachable once it is published through a tunnel, and it
 * shows photographs and full names of everyone working tonight. That is
 * personal data about staff, and /api/board/swap is a write endpoint that
 * changes who the building believes is in charge. Neither can stay open.
 *
 * A shared header would have to ship in the JS bundle to be usable from the
 * browser, which is no secret at all. Instead each tablet is paired once at
 * /setup, and the server hands back an httpOnly cookie the browser sends
 * automatically. The secret never reaches client JavaScript.
 *
 * The cookie is a signed, self-describing token rather than a database row — no
 * table, no lookup on the polling path. BOARD_SETUP_TOKEN doubles as the HMAC
 * key, which gives revocation for free: change it and every paired tablet is
 * invalidated at once.
 *
 * The token also carries the floor the tablet was paired to. That is what lets
 * "/" open the right board on boot with nothing typed, and it means a tablet
 * paired to the ground floor cannot be pointed at another floor's board and
 * quietly edit it.
 */

export const DEVICE_COOKIE = "harbour_board_device";

/** A year. A tablet should be paired once and left alone on the wall. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setupToken(): string {
  const value = process.env.BOARD_SETUP_TOKEN?.trim();
  if (!value) {
    throw new Error(
      "BOARD_SETUP_TOKEN is not set. Tablets cannot be paired, so board endpoints are refusing requests.",
    );
  }
  return value;
}

export function isPairingConfigured(): boolean {
  return Boolean(process.env.BOARD_SETUP_TOKEN?.trim());
}

/**
 * Whether pairing is enforced.
 *
 * Fails closed: in production the answer is always yes, so a deployment that
 * forgets BOARD_SETUP_TOKEN returns errors rather than quietly publishing the
 * staff list. In development an unset token leaves the board open, so a fresh
 * clone runs without setup.
 */
export function isPairingRequired(): boolean {
  return isPairingConfigured() || process.env.NODE_ENV === "production";
}

function sign(payload: string): string {
  return createHmac("sha256", setupToken()).update(payload).digest("base64url");
}

/** Constant-time compare that tolerates length mismatch. */
export function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mintDeviceToken(floorSlug: string): string {
  const deviceId = randomUUID();
  const expiresAt = Date.now() + DEVICE_COOKIE_MAX_AGE * 1000;
  // Slugs are constrained to [a-z0-9-] by the floors_slug_shape CHECK, so a dot
  // separator is unambiguous and needs no escaping.
  const payload = `${deviceId}.${floorSlug}.${expiresAt}`;
  return `v1.${payload}.${sign(payload)}`;
}

/** The floor this tablet is paired to, or null if the token is bad or expired. */
export function readDeviceToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;

  const [, deviceId, floorSlug, expiresAt, signature] = parts;

  if (!equals(signature, sign(`${deviceId}.${floorSlug}.${expiresAt}`))) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;

  return floorSlug;
}

/** Does the code typed at /setup match the configured one? */
export function matchesSetupToken(candidate: string): boolean {
  return equals(candidate, setupToken());
}
