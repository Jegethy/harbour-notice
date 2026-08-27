import { redirect } from "next/navigation";
import { pairedFloor } from "@/lib/board/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Where a tablet lands on boot.
 *
 * The device cookie already names the floor this tablet was paired to, so there
 * is nothing to choose and nothing to type: power on, launch the browser at "/",
 * and the right board is on the wall. That is the whole reason the floor is
 * baked into the pairing token rather than kept in a bookmark — a bookmark is
 * one accidental tap away from being lost, and then the tablet needs somebody
 * technical rather than somebody with the setup code.
 */
export default async function BoardEntryPage() {
  const floor = await pairedFloor();

  if (floor === null) {
    redirect("/setup");
  }

  if (floor !== "*") {
    redirect(`/board/${floor}`);
  }

  // Development with no BOARD_SETUP_TOKEN set: nothing is paired, so open the
  // first floor rather than making a fresh clone go through pairing.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("floors")
    .select("slug")
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[board] could not read floors with the service-role key. Check SUPABASE_SERVICE_ROLE_KEY.",
      error,
    );
  }

  redirect(data ? `/board/${data.slug}` : "/setup");
}
