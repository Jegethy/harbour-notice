import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Refreshes the staff session and enforces the /admin redirect rules.
 *
 * The cookie dance here is prescribed by @supabase/ssr: a refreshed token has
 * to be written onto both the request (so the rest of this pass sees it) and
 * onto the response that is ultimately returned (so the browser stores it).
 * Returning a response built any other way silently drops the refresh, and
 * staff get logged out roughly every hour.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  try {
    return await runSession(request);
  } catch (thrown) {
    // Missing credentials throw here, which would otherwise surface as an
    // opaque 500 on the login page itself — the one screen an administrator looks
    // at when something is wrong. Detail goes to the server log only.
    console.error("[admin] session check failed", thrown);
    return new NextResponse(
      "<h1>The noticeboard admin is unavailable</h1><p>The server is not configured correctly. Please contact your administrator.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function runSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser(), not getSession(): this revalidates the token with Supabase
  // rather than trusting a cookie the browser handed us.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const onLoginPage = pathname === "/admin/login";

  if (!user && !onLoginPage) {
    const target = request.nextUrl.clone();
    target.pathname = "/admin/login";
    // Send them back where they were aiming once they have signed in.
    target.searchParams.set("next", pathname);
    return withCookies(NextResponse.redirect(target), response);
  }

  if (user && onLoginPage) {
    const target = request.nextUrl.clone();
    target.pathname = "/admin";
    target.search = "";
    return withCookies(NextResponse.redirect(target), response);
  }

  return response;
}

/** Carry any refreshed auth cookies onto a redirect, which would otherwise lose them. */
function withCookies(redirect: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
