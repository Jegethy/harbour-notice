import { NextResponse } from "next/server";
import { deviceRejection, unlockedFor } from "@/lib/board/guard";
import { isRole } from "@/lib/board/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everyone who could fill a slot in this section.
 *
 * Behind the editing window, not just the device cookie. The list is the whole
 * active staff roll with photographs, which is more than the board itself shows
 * — the board only names the handful of people on tonight. Handing that out to
 * any paired tablet on request would make the PIN pointless for the one thing
 * it most obviously protects.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ floor: string }> },
) {
  const { floor } = await params;

  const rejection = await deviceRejection(floor);
  if (rejection) return rejection;

  if (!(await unlockedFor(floor))) {
    return NextResponse.json(
      { outcome: "LOCKED", message: "Enter the PIN to make changes." },
      { status: 403 },
    );
  }

  const role = new URL(request.url).searchParams.get("role");
  if (!isRole(role)) {
    return NextResponse.json({ outcome: "ERROR", message: "Unknown role." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("available_staff", {
    p_role: role,
    p_floor_slug: floor,
  });

  if (error) {
    console.error("[board] available_staff failed", error);
    return NextResponse.json(
      { outcome: "ERROR", message: "Could not load the staff list." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { outcome: "OK", staff: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
