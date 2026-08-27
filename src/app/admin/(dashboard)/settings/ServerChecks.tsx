import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Does the server's own connection to Supabase work?
 *
 * This panel exists because of a genuinely confusing failure mode. The admin
 * panel reads as the signed-in user (anon key + session, RLS applies), while the
 * corridor boards and the tablet setup screen read with the service-role key.
 * Those are two different credentials, and only one of them is being exercised
 * by the fact that you can see this page at all.
 *
 * So the boards can be completely dead while the admin panel looks perfect —
 * and the symptom lands on a tablet in a corridor, which reports it as "the
 * screen is broken". The check belongs here, where somebody who can act on it is
 * already signed in.
 *
 * Nothing here prints a key. The role claim is read out of the JWT, which the
 * browser never receives.
 */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * What role does this key actually grant?
 *
 * Supabase's legacy keys are JWTs carrying a `role` claim, and pasting the anon
 * key into SUPABASE_SERVICE_ROLE_KEY is the most common mistake after leaving
 * the placeholder in — the two sit next to each other on the same dashboard
 * page and look alike. Decoding the payload is not a secrets operation; the
 * claim is public metadata, and this runs on the server regardless.
 *
 * Newer projects issue opaque `sb_secret_…` keys with no claims to read, so an
 * unknown answer here is not a failure — the live call below is what decides.
 */
function roleClaimOf(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export async function ServerChecks() {
  const checks: Check[] = [];

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const role = roleClaimOf(serviceKey);

  if (!serviceKey) {
    checks.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      ok: false,
      detail: "Not set. The boards and the tablet setup screen cannot work without it.",
    });
  } else if (serviceKey === "your-service-role-key") {
    checks.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      ok: false,
      detail:
        "Still the example placeholder from .env.local.example. Replace it with the real key from Supabase (Project Settings -> API -> service_role).",
    });
  } else if (role && role !== "service_role") {
    checks.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      ok: false,
      detail: `This key's role is "${role}", not "service_role" — it looks like the ${
        role === "anon" ? "anon (publishable) key" : `${role} key`
      } was pasted by mistake. Copy the service_role key instead.`,
    });
  } else {
    checks.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      ok: true,
      detail: role
        ? `Present, role "${role}". ${serviceKey.length} characters.`
        : `Present. ${serviceKey.length} characters (no readable role claim — a newer sb_secret_… key).`,
    });
  }

  const setupToken = process.env.BOARD_SETUP_TOKEN?.trim();

  checks.push({
    name: "BOARD_SETUP_TOKEN",
    ok: Boolean(setupToken),
    detail: setupToken
      ? "Present. Tablets can be paired at /setup."
      : "Not set. In production every board endpoint refuses requests.",
  });

  // The live calls. These are the two the boards actually make, so they are the
  // ones worth testing rather than a generic connection check.
  try {
    const supabase = createAdminClient();

    const { data: floors, error } = await supabase
      .from("floors")
      .select("slug")
      .order("sort_order");

    checks.push({
      name: "Read the floor list (service-role)",
      ok: !error,
      detail: error
        ? `Failed: ${error.message}${error.code ? ` (code ${error.code})` : ""}`
        : `Worked — ${floors?.length ?? 0} floor${floors?.length === 1 ? "" : "s"} visible. This is what /setup lists.`,
    });

    const firstSlug = floors?.[0]?.slug;

    if (!error && firstSlug) {
      const { data: snapshot, error: rpcError } = await supabase.rpc("board_snapshot", {
        p_floor_slug: firstSlug,
      });

      const outcome = (snapshot as { outcome?: string } | null)?.outcome;

      checks.push({
        name: "Render a board (board_snapshot)",
        ok: !rpcError && outcome === "OK",
        detail: rpcError
          ? `Failed: ${rpcError.message}${rpcError.code ? ` (code ${rpcError.code})` : ""}. If this mentions the function not existing, the migrations have not been applied.`
          : outcome === "OK"
            ? `Worked for "${firstSlug}".`
            : `Returned "${outcome ?? "nothing"}" for "${firstSlug}".`,
      });
    }
  } catch (thrown) {
    checks.push({
      name: "Connect to Supabase (service-role)",
      ok: false,
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    });
  }

  const failing = checks.filter((check) => !check.ok);

  return (
    <div className="flex flex-col gap-3">
      {failing.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          The boards are not working. This panel checks the server&rsquo;s own connection,
          which is a different credential from the one that logged you in — so this page
          can look perfectly healthy while every tablet is dead.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li
            key={check.name}
            className={`flex gap-3 rounded-lg border px-4 py-3 ${
              check.ok
                ? "border-neutral-dark/10 bg-white"
                : "border-brand-accent/40 bg-brand-accent/5"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                check.ok ? "bg-status-ok" : "bg-brand-accent"
              }`}
            >
              {check.ok ? "✓" : "!"}
            </span>

            <div className="min-w-0">
              <p className="font-bold text-neutral-dark">
                {check.name}
                <span className="sr-only">{check.ok ? " — passing" : " — failing"}</span>
              </p>
              <p className="mt-0.5 break-words text-sm text-neutral-dark/70">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-neutral-dark/50">
        Environment variables are read when the server starts. After editing
        .env.local, restart the server before re-checking.
      </p>
    </div>
  );
}
