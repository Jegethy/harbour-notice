import type { Metadata } from "next";
import { RotaPlanner } from "@/components/admin/RotaPlanner";
import { requireAdmin } from "@/lib/auth";
import { isShift, type Shift } from "@/lib/board/shift";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rota — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

export default async function RotaPage({ searchParams }: PageProps<"/admin/rota">) {
  await requireAdmin();

  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: shiftRows }, { data: floors }, { data: staff }] = await Promise.all([
    supabase.rpc("current_shift", {}),
    supabase.from("floors").select("slug, name").order("sort_order"),
    supabase.from("staff").select("*").eq("is_active", true).order("full_name"),
  ]);

  const current = shiftRows?.[0];

  if (!floors || floors.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
        No floors yet. Add one under Settings before planning a rota.
      </p>
    );
  }

  // Defaults land on the shift that is running now, which is what somebody
  // opening this page mid-handover almost always wants to look at.
  const floorSlug = pickFloor(params.floor, floors);
  const shiftDate = pickDate(params.date, current?.shift_date);
  const shift = pickShift(params.shift, current?.shift);

  const { data: slots } = await supabase.rpc("rota_for", {
    p_floor_slug: floorSlug,
    p_shift_date: shiftDate,
    p_shift: shift,
  });

  return (
    <RotaPlanner
      floors={floors}
      floorSlug={floorSlug}
      shiftDate={shiftDate}
      shift={shift}
      slots={slots ?? []}
      staff={staff ?? []}
      isCurrentShift={current?.shift_date === shiftDate && current?.shift === shift}
    />
  );
}

type Param = string | string[] | undefined;

function pickFloor(value: Param, floors: { slug: string }[]): string {
  const slug = typeof value === "string" ? value : "";
  return floors.some((floor) => floor.slug === slug) ? slug : floors[0].slug;
}

function pickDate(value: Param, fallback: string | undefined): string {
  const date = typeof value === "string" ? value : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  // Falls back to the server's idea of today rather than the browser's; the two
  // disagree either side of midnight, and only one of them decides what the
  // boards show.
  return fallback ?? new Date().toISOString().slice(0, 10);
}

function pickShift(value: Param, fallback: Shift | undefined): Shift {
  if (isShift(value)) return value;
  return fallback ?? "DAY";
}
