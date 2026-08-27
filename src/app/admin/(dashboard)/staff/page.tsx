import type { Metadata } from "next";
import { StaffTable } from "@/components/admin/StaffTable";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Staff — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    // Active first, then alphabetically. Sorting by role would put the list in
    // an order nobody scans by: you come here looking for a person by name.
    .order("is_active", { ascending: false })
    .order("full_name");

  if (error) {
    console.error("[admin] could not load staff", error);
  }

  return <StaffTable staff={data ?? []} />;
}
