import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isPairingConfigured, isPairingRequired } from "@/lib/board/device";
import { pairedFloor } from "@/lib/board/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Set up this tablet — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  code: "That setup code was not recognised.",
  missing: "Please enter the setup code.",
  floor: "Please choose which floor this tablet is for.",
  rate: "Too many attempts. Please wait 15 minutes and try again.",
  invalid: "Something went wrong. Please try again.",
  unconfigured: "Pairing is not configured on the server.",
};

/**
 * Pair a tablet to one floor.
 *
 * A plain HTML form posting to /api/board/pair — no client component, no
 * hydration required. This is the one screen that has to work on an unfamiliar
 * tablet before anything else does, and a React-controlled form fails silently
 * when the bundle does not load: the field accepts typing but the button never
 * enables, with nothing on screen to explain why. Whoever is up a ladder
 * mounting the thing should not need to know that.
 */
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  if ((await pairedFloor()) !== null) {
    redirect("/");
  }

  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const error = errorCode ? (ERRORS[errorCode] ?? ERRORS.invalid) : null;

  // This read uses the service-role key, unlike the admin panel, which reads as
  // the signed-in user. So "the admin panel lists three floors but this screen
  // says there are none" is the signature of a bad SUPABASE_SERVICE_ROLE_KEY,
  // not of missing data — which is exactly why the error is kept separate from
  // the empty case below rather than collapsed into it.
  const supabase = createAdminClient();
  const { data: floors, error: floorsError } = await supabase
    .from("floors")
    .select("slug, name")
    .order("sort_order");

  if (floorsError) {
    console.error(
      "[setup] could not read floors with the service-role key. Check SUPABASE_SERVICE_ROLE_KEY.",
      floorsError,
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 overflow-y-auto bg-brand-primary px-8 py-10 text-center">
      <h1 className="text-4xl font-bold text-brand-cream sm:text-5xl">Set up this tablet</h1>

      {isPairingConfigured() ? (
        <>
          <p className="max-w-lg text-balance text-xl text-cream-dim">
            Choose the floor this tablet is mounted on and enter the setup code. You only
            need to do this once.
          </p>

          <form
            method="post"
            action="/api/board/pair"
            className="flex w-full max-w-md flex-col gap-4"
          >
            <fieldset className="flex flex-col gap-2 text-left">
              <legend className="mb-2 text-lg font-semibold text-brand-cream">Floor</legend>

              {/* Radio buttons rather than a <select>: a native picker on a
                  locked-down tablet opens a system overlay, which is both a
                  breakout route and a thing that can appear behind the kiosk
                  chrome with no way to dismiss it. */}
              {(floors ?? []).map((floor, index) => (
                <label
                  key={floor.slug}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-cream-dim/40 bg-brand-deep px-5 py-4 text-lg text-brand-cream has-checked:border-brand-cream"
                >
                  <input
                    type="radio"
                    name="floor"
                    value={floor.slug}
                    defaultChecked={index === 0}
                    required
                    className="h-5 w-5 accent-brand-cream"
                  />
                  {floor.name}
                </label>
              ))}

              {floorsError ? (
                <p
                  role="alert"
                  className="rounded-xl border-2 border-brand-accent bg-brand-deep px-5 py-4 text-left text-base text-brand-cream"
                >
                  <strong>The server could not read the floor list.</strong> This is a
                  server configuration problem, not a missing floor — check
                  SUPABASE_SERVICE_ROLE_KEY. The administrator can see the details under
                  Settings, or in the server log.
                </p>
              ) : (floors ?? []).length === 0 ? (
                <p className="rounded-xl border-2 border-cream-dim/40 bg-brand-deep px-5 py-4 text-left text-base text-cream-dim">
                  No floors have been created yet. Add one in the admin panel first.
                </p>
              ) : null}
            </fieldset>

            <label className="flex flex-col gap-2 text-left">
              <span className="text-lg font-semibold text-brand-cream">Setup code</span>
              <input
                type="password"
                name="token"
                autoComplete="off"
                autoFocus
                required
                className="rounded-xl border-2 border-cream-dim/40 bg-brand-deep px-5 py-4 text-xl text-brand-cream outline-none focus:border-brand-cream"
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border-2 border-brand-accent bg-brand-deep px-4 py-3 text-base font-semibold text-brand-cream"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="rounded-xl bg-brand-cream px-6 py-4 text-xl font-bold text-brand-primary"
            >
              Set up this tablet
            </button>
          </form>
        </>
      ) : (
        <p className="max-w-lg text-balance text-xl text-cream-dim">
          The noticeboard is not configured on the server.{" "}
          {isPairingRequired() ? "BOARD_SETUP_TOKEN is missing from the environment." : ""}{" "}
          Please contact your administrator.
        </p>
      )}
    </div>
  );
}
