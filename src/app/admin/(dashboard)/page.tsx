import type { Metadata } from "next";
import Link from "next/link";
import { DutyRefresher } from "@/components/admin/DutyRefresher";
import { requireAdmin } from "@/lib/auth";
import { ROLES, ROLE_SPECS, initialsOf, type Role } from "@/lib/board/roles";
import { photoUrl } from "@/lib/board/photo";
import { formatShiftDate, shiftHours, shiftLabel } from "@/lib/board/shift";
import { createClient } from "@/lib/supabase/server";
import type { RotaSlotRow } from "@/lib/types/database";

export const metadata: Metadata = {
  title: "On duty now — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

/**
 * Every floor, right now, on one screen.
 *
 * The thing an administrator actually opens this panel to find out: is each
 * board filled in, and does it look right. Read-only on purpose — changing who
 * is on duty is the floor's job through the tablet, or a rota entry made in
 * advance. An admin who edits the current shift from an office is editing a
 * board somebody is standing in front of.
 */
export default async function OverviewPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [{ data: shiftRows, error: shiftError }, { data: floors, error: floorsError }] =
    await Promise.all([
      supabase.rpc("current_shift", {}),
      supabase.from("floors").select("slug, name").order("sort_order"),
    ]);

  if (shiftError || floorsError) {
    console.error("[admin] overview failed", shiftError ?? floorsError);
    return <Unavailable />;
  }

  const current = shiftRows?.[0];
  if (!current) return <Unavailable />;

  const boards = await Promise.all(
    (floors ?? []).map(async (floor) => {
      const { data } = await supabase.rpc("rota_for", {
        p_floor_slug: floor.slug,
        p_shift_date: current.shift_date,
        p_shift: current.shift,
      });
      return { floor, slots: data ?? [] };
    }),
  );

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">On duty now</h1>
          <p className="mt-1 text-sm text-neutral-dark/70">
            {shiftLabel(current.shift)} · {formatShiftDate(current.shift_date)} ·{" "}
            {shiftHours(current.shift)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DutyRefresher />
          <Link
            href="/admin/rota"
            className="rounded-lg bg-brand-primary px-5 py-2.5 text-base font-bold text-brand-cream transition-colors hover:bg-brand-deep"
          >
            Plan the rota
          </Link>
        </div>
      </header>

      {boards.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
          No floors yet. Add one under Settings, then pair a tablet to it.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {boards.map(({ floor, slots }) => (
            <FloorCard key={floor.slug} name={floor.name} slug={floor.slug} slots={slots} />
          ))}
        </div>
      )}
    </section>
  );
}

function FloorCard({
  name,
  slug,
  slots,
}: {
  name: string;
  slug: string;
  slots: RotaSlotRow[];
}) {
  const nurse = slots.find((slot) => slot.role === "NURSE");

  return (
    <article className="rounded-xl border border-neutral-dark/10 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-neutral-dark">{name}</h2>
        <div className="flex items-center gap-2">
          {/* The one gap worth calling out from across the room. Every other
              section being short is routine; no nurse in charge recorded is a
              question somebody needs to answer. */}
          {nurse ? null : (
            <span className="rounded-full bg-brand-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-accent">
              No nurse recorded
            </span>
          )}
          <Link
            href={`/board/${slug}`}
            className="text-sm font-bold text-brand-primary underline"
          >
            View board
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {ROLES.map((role) => (
          <RoleRow key={role} role={role} slots={slots.filter((slot) => slot.role === role)} />
        ))}
      </div>
    </article>
  );
}

function RoleRow({ role, slots }: { role: Role; slots: RotaSlotRow[] }) {
  const spec = ROLE_SPECS[role];
  const sorted = [...slots].sort((a, b) => a.slot_index - b.slot_index);

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-neutral-dark/50">
        {spec.label}{" "}
        <span className="tabular-nums text-neutral-dark/35">
          {sorted.length} of {spec.capacity}
        </span>
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-dark/40">Nobody recorded</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sorted.map((slot) => (
            <li
              key={`${slot.role}-${slot.slot_index}`}
              className="flex items-center gap-2 rounded-full border border-neutral-dark/10 bg-neutral-light py-1 pl-1 pr-3"
            >
              <Face slot={slot} />
              <span className="text-sm font-semibold text-neutral-dark">{slot.full_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Face({ slot }: { slot: RotaSlotRow }) {
  if (!slot.has_photo) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/10 text-[0.6rem] font-bold text-brand-primary">
        {initialsOf(slot.full_name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- private proxied route.
    <img
      src={photoUrl(slot.staff_id, slot.photo_updated_at)}
      alt=""
      className="h-7 w-7 rounded-full object-cover object-top"
    />
  );
}

function Unavailable() {
  return (
    <p
      role="alert"
      className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
    >
      Could not load the duty boards. Please refresh, and check the server logs if this
      continues.
    </p>
  );
}
