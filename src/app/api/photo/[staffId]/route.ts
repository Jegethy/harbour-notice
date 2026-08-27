import { NextResponse } from "next/server";
import { pairedFloor } from "@/lib/board/guard";
import { isPairingRequired } from "@/lib/board/device";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stream one staff photograph out of the private bucket.
 *
 * Not a Supabase signed URL, deliberately. A signed URL is different on every
 * request, so the board — which re-reads its data every few seconds — would
 * treat each poll as a set of new images and every face on the wall would
 * flicker. This path is stable and carries the photo's own version in `?v=`, so
 * the browser fetches each picture once and re-uses it until it actually
 * changes.
 *
 * Gated on the device cookie OR an admin session. Any paired tablet may fetch
 * any photograph: the alternative is checking each face against the requesting
 * floor's current board, which would break the swap modal (it shows staff who
 * are not on this board yet, which is the entire point of it).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await params;

  if (!UUID.test(staffId)) {
    return new NextResponse(null, { status: 404 });
  }

  if (!(await isAuthorised())) {
    return new NextResponse(null, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: person, error } = await supabase
    .from("staff")
    .select("photo_path")
    .eq("id", staffId)
    .maybeSingle();

  if (error) {
    console.error("[photo] lookup failed", error);
    return new NextResponse(null, { status: 503 });
  }

  if (!person?.photo_path) {
    // No photograph: the card falls back to initials. Not cached — the answer
    // changes the moment someone uploads one, and a cached 404 would leave a
    // blank disc on the wall until the tablet was restarted.
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from("staff-photos")
    .download(person.photo_path);

  if (downloadError || !file) {
    console.error("[photo] download failed", downloadError);
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(file.stream(), {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      // Safe to cache hard: the URL carries ?v=<photo_updated_at>, so replacing
      // a photograph produces a different URL rather than a stale hit.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

async function isAuthorised(): Promise<boolean> {
  if (!isPairingRequired()) return true;
  if ((await pairedFloor()) !== null) return true;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}
