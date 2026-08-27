import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  isPairingConfigured,
  matchesSetupToken,
  mintDeviceToken,
} from "@/lib/board/device";
import { checkLimit, clientKey } from "@/lib/board/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Relative Location on purpose.
 *
 * NextResponse.redirect() needs an absolute URL, and behind a tunnel
 * request.url is the internal origin (http://localhost:3000) — sending the
 * tablet there would strand it on a page that does not exist from where it is
 * standing. A relative Location is valid HTTP and resolves against whatever
 * hostname the browser actually used.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * Exchange the setup code for a long-lived device cookie naming one floor.
 *
 * Answers both a plain HTML form post (redirects) and JSON (returns JSON), so
 * pairing works with no client-side JavaScript at all. That matters: this is the
 * one screen that has to work on an unfamiliar tablet, and a React-controlled
 * form that silently does nothing when hydration fails leaves whoever is
 * mounting the tablet with no way in and nothing on screen to explain why.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded");

  const fail = (status: number, code: string, message: string) =>
    isFormPost
      ? seeOther(`/setup?error=${code}`)
      : NextResponse.json({ ok: false, message }, { status });

  if (!isPairingConfigured()) {
    return fail(503, "unconfigured", "Pairing is not configured on the server.");
  }

  if (checkLimit(clientKey(request, "pair"), MAX_ATTEMPTS, ATTEMPT_WINDOW_MS).limited) {
    return fail(429, "rate", "Too many attempts. Please wait 15 minutes and try again.");
  }

  let token: unknown;
  let floor: unknown;
  try {
    if (isFormPost) {
      const form = await request.formData();
      token = form.get("token");
      floor = form.get("floor");
    } else {
      const body = (await request.json()) as { token?: unknown; floor?: unknown } | null;
      token = body?.token;
      floor = body?.floor;
    }
  } catch {
    return fail(400, "invalid", "Invalid request.");
  }

  if (typeof token !== "string" || token.trim() === "") {
    return fail(400, "missing", "Please enter the setup code.");
  }

  if (typeof floor !== "string" || floor.trim() === "") {
    return fail(400, "floor", "Please choose which floor this tablet is for.");
  }

  if (!matchesSetupToken(token.trim())) {
    return fail(401, "code", "That setup code was not recognised.");
  }

  // Confirm the floor exists before minting a token for it. A cookie naming a
  // floor that was renamed or deleted would pair the tablet to a board that
  // 404s, and the only cure would be re-pairing — after somebody worked out
  // that was the problem.
  const supabase = createAdminClient();
  const { data: match, error } = await supabase
    .from("floors")
    .select("slug")
    .eq("slug", floor.trim())
    .maybeSingle();

  if (error) {
    console.error("[board] could not verify floor during pairing", error);
    return fail(503, "invalid", "Could not reach the database. Please try again.");
  }

  if (!match) {
    return fail(400, "floor", "That floor no longer exists.");
  }

  const response = isFormPost
    ? seeOther(`/board/${match.slug}`)
    : NextResponse.json({ ok: true, floor: match.slug });

  response.cookies.set(DEVICE_COOKIE, mintDeviceToken(match.slug), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });

  return response;
}
