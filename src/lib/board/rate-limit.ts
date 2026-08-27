import "server-only";

/**
 * In-memory attempt limiting for the two endpoints that guard a shared secret:
 * tablet pairing and the 4-digit swap PIN.
 *
 * In-memory is adequate here. This runs as a single Node process on one server,
 * and the goal is to make guessing a 4-digit PIN impractical rather than to be a
 * distributed limiter. If the app is ever scaled to more than one process, this
 * becomes per-process and the real limit belongs at the Cloudflare edge — which
 * DEPLOYMENT.md already asks for as a second layer.
 *
 * The counter resets on restart. That is a deliberate trade: an attacker who can
 * restart the server has already won, and a limiter that survived restarts would
 * need storage that a corridor tablet outage could then lock everyone out of.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface LimitResult {
  limited: boolean;
  /** Seconds until the window resets. Shown to the user so the wait is knowable. */
  retryAfter: number;
}

export function checkLimit(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: 0 };
  }

  bucket.count += 1;

  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 500) {
    for (const [existing, value] of buckets) {
      if (now > value.resetAt) buckets.delete(existing);
    }
  }

  return {
    limited: bucket.count > max,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Forget a key. Called after a correct PIN so one success clears the count. */
export function clearLimit(key: string): void {
  buckets.delete(key);
}

/** Best available identifier for the caller. */
export function clientKey(request: Request, scope: string): string {
  // Behind a Cloudflare Tunnel the original address arrives in these headers.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  return `${scope}:${ip}`;
}
