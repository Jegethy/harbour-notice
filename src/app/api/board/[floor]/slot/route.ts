import { NextResponse } from "next/server";
import { deviceRejection, unlockedFor } from "@/lib/board/guard";
import { ROLE_SPECS, isRole } from "@/lib/board/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Put someone in a slot, or empty it.
 *
 * `staff_id: null` clears the slot — that is how "X has gone home and nobody
 * replaced them" is recorded, which matters because the alternative is staff
 * leaving a stale face on the wall rather than showing the section short.
 *
 * Which shift this writes to is decided by the database, not by anything sent
 * from the tablet. See set_slot() in 0001_init.sql.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ floor: string }> },
) {
  const { floor } = await params;

  const rejection = await deviceRejection(floor);
  if (rejection) return rejection;

  // Re-checked here rather than trusted from the modal being open: this
  // endpoint is reachable by anyone who can post to it, whatever the UI did.
  if (!(await unlockedFor(floor))) {
    return NextResponse.json(
      { outcome: "LOCKED", message: "That editing window has closed. Enter the PIN again." },
      { status: 403 },
    );
  }

  let payload: { role?: unknown; slot_index?: unknown; staff_id?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ outcome: "ERROR", message: "Invalid request." }, { status: 400 });
  }

  const { role, slot_index: slotIndex, staff_id: staffId } = payload;

  if (!isRole(role)) {
    return NextResponse.json({ outcome: "ERROR", message: "Unknown role." }, { status: 400 });
  }

  if (
    typeof slotIndex !== "number" ||
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= ROLE_SPECS[role].capacity
  ) {
    return NextResponse.json({ outcome: "ERROR", message: "Unknown slot." }, { status: 400 });
  }

  if (staffId !== null && (typeof staffId !== "string" || !UUID.test(staffId))) {
    return NextResponse.json({ outcome: "ERROR", message: "Unknown person." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("set_slot", {
    p_floor_slug: floor,
    p_role: role,
    p_slot_index: slotIndex,
    p_staff_id: staffId,
  });

  if (error) {
    console.error("[board] set_slot failed", error);
    return NextResponse.json(
      { outcome: "ERROR", message: "Could not save that change. Please try again." },
      { status: 503 },
    );
  }

  const result = data as {
    outcome?: string;
    full_name?: string;
    staff_role?: string;
    slot_role?: string;
  } | null;

  switch (result?.outcome) {
    case "SET":
      return NextResponse.json({ outcome: "SET", full_name: result.full_name });
    case "CLEARED":
      return NextResponse.json({ outcome: "CLEARED" });
    case "NO_SUCH_STAFF":
      return NextResponse.json(
        { outcome: "ERROR", message: "That person is no longer on the staff list." },
        { status: 409 },
      );
    case "WRONG_ROLE":
      // The modal only offers eligible people, so reaching this means the staff
      // list changed underneath an open modal — or something posted directly.
      return NextResponse.json(
        {
          outcome: "ERROR",
          message: `${result.full_name ?? "That person"} does not hold this role. Close and reopen the board to refresh the list.`,
        },
        { status: 409 },
      );
    default:
      return NextResponse.json(
        { outcome: "ERROR", message: "Could not save that change." },
        { status: 409 },
      );
  }
}
