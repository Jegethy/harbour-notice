"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyPreviousShiftAction, setRotaSlotAction } from "@/app/admin/actions";
import { ROLES, ROLE_SPECS, type Role } from "@/lib/board/roles";
import { formatShiftDate, type Shift } from "@/lib/board/shift";
import type { RotaSlotRow, StaffRow } from "@/lib/types/database";

/**
 * Plan a shift in advance.
 *
 * This is the answer to "can it change automatically at handover". Nothing here
 * is scheduled and nothing runs at 08:00 or 20:00 — the boards render whichever
 * shift the database says it currently is, so a night shift filled in on Monday
 * afternoon is simply what the wall shows when 20:00 arrives. Leave a shift
 * blank and the floor fills it in on the tablet instead. Both routes write the
 * same rows.
 *
 * Deliberately a grid of every slot, including the empty ones — the opposite of
 * the board's rule. Here the empty slots are the work: an administrator is
 * looking for the gaps, where somebody in a corridor is looking for a face.
 *
 * Each dropdown offers only people who hold that role, and names the role beside
 * every person so the pairing is checkable at a glance rather than by memory.
 * set_slot_at() refuses a mismatch too, so this is a courtesy rather than the
 * enforcement — see 0003_role_restriction.sql. Assignments made before that rule
 * existed stay visible, flagged, and selectable, so they can be corrected rather
 * than silently dropped the next time something else on the shift is edited.
 */
export function RotaPlanner({
  floors,
  floorSlug,
  shiftDate,
  shift,
  slots,
  staff,
  isCurrentShift,
}: {
  floors: { slug: string; name: string }[];
  floorSlug: string;
  shiftDate: string;
  shift: Shift;
  slots: RotaSlotRow[];
  staff: StaffRow[];
  /** True when this is the shift the boards are showing right now. */
  isCurrentShift: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function navigate(next: { floor?: string; date?: string; shift?: Shift }) {
    const params = new URLSearchParams({
      floor: next.floor ?? floorSlug,
      date: next.date ?? shiftDate,
      shift: next.shift ?? shift,
    });
    router.push(`/admin/rota?${params}`);
  }

  function assign(role: Role, slotIndex: number, staffId: string | null) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("floor", floorSlug);
      formData.set("shift_date", shiftDate);
      formData.set("shift", shift);
      formData.set("role", role);
      formData.set("slot_index", String(slotIndex));
      if (staffId) formData.set("staff_id", staffId);

      const result = await setRotaSlotAction(formData);

      if (result.error) setError(result.error);
      else {
        setError(null);
        setNotice(null);
        router.refresh();
      }
    });
  }

  function copyPrevious() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("floor", floorSlug);
      formData.set("shift_date", shiftDate);
      formData.set("shift", shift);

      const result = await copyPreviousShiftAction(formData);

      setError(result.error ?? null);
      setNotice(result.notice ?? null);
      router.refresh();
    });
  }

  // Who is already placed somewhere on this shift, so the dropdowns can say so
  // rather than letting the same person be picked twice by accident.
  const placed = new Map(slots.map((slot) => [slot.staff_id, slot]));

  return (
    <section>
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">Rota</h1>
        <p className="mt-1 text-sm text-neutral-dark/70">
          Fill a shift in ahead of time and the board changes to it by itself at
          handover. Anything left blank can still be set on the tablet.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-dark/10 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
            Floor
          </span>
          <select
            value={floorSlug}
            onChange={(event) => navigate({ floor: event.target.value })}
            className="rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 font-semibold"
          >
            {floors.map((floor) => (
              <option key={floor.slug} value={floor.slug}>
                {floor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
            Shift starting
          </span>
          <input
            type="date"
            value={shiftDate}
            onChange={(event) => event.target.value && navigate({ date: event.target.value })}
            className="rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 font-semibold"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
            Shift
          </span>
          <div className="flex overflow-hidden rounded-lg border-2 border-neutral-dark/20">
            {(["DAY", "NIGHT"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => navigate({ shift: option })}
                className={`px-4 py-2 text-sm font-bold transition-colors ${
                  shift === option
                    ? "bg-brand-primary text-brand-cream"
                    : "bg-white text-neutral-dark/60"
                }`}
              >
                {option === "DAY" ? "Day 08:00" : "Night 20:00"}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={copyPrevious}
          disabled={pending}
          className="ml-auto rounded-lg border-2 border-brand-primary px-4 py-2.5 text-sm font-bold text-brand-primary disabled:opacity-50"
        >
          Copy previous shift
        </button>
      </div>

      <p className="mb-4 text-sm font-semibold text-neutral-dark/70">
        {formatShiftDate(shiftDate)} · {shift === "DAY" ? "Day" : "Night"} shift
        {isCurrentShift ? (
          <span className="ml-2 rounded-full bg-status-ok/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-status-ok">
            Live on the board now
          </span>
        ) : null}
      </p>

      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-lg border-2 border-status-ok bg-status-ok/10 px-4 py-3 text-sm font-semibold text-status-ok"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {error}
        </p>
      ) : null}

      {staff.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
          Add some staff first — there is nobody to roster yet.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {ROLES.map((role) => {
            const eligible = staff.filter((person) => person.role === role);

            return (
              <fieldset
                key={role}
                className="rounded-xl border border-neutral-dark/10 bg-white p-4 shadow-sm"
              >
                <legend className="px-2 text-sm font-bold uppercase tracking-[0.1em] text-brand-primary">
                  {ROLE_SPECS[role].label}
                </legend>

                {eligible.length === 0 ? (
                  <p className="mb-3 rounded-lg bg-brand-accent/5 px-3 py-2 text-sm font-semibold text-brand-accent">
                    Nobody on the staff list is a{" "}
                    {ROLE_SPECS[role].singular.toLowerCase()}. Add one under Staff before
                    rostering this section.
                  </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: ROLE_SPECS[role].capacity }, (_, slotIndex) => {
                    const filled = slots.find(
                      (slot) => slot.role === role && slot.slot_index === slotIndex,
                    );

                    // Predates the role rule: somebody is standing in a slot they
                    // do not hold. Flagged rather than quietly dropped.
                    const mismatched = Boolean(filled && filled.role !== role);

                    return (
                      <label key={slotIndex} className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-neutral-dark/50">
                          {ROLE_SPECS[role].singular} {slotIndex + 1}
                        </span>

                        <select
                          value={filled?.staff_id ?? ""}
                          disabled={pending}
                          onChange={(event) =>
                            assign(role, slotIndex, event.target.value || null)
                          }
                          className={`rounded-lg border-2 px-3 py-2.5 font-semibold disabled:opacity-50 ${
                            mismatched
                              ? "border-brand-accent bg-brand-accent/5 text-neutral-dark"
                              : filled
                                ? "border-neutral-dark/20 bg-white text-neutral-dark"
                                : "border-dashed border-neutral-dark/25 bg-neutral-light text-neutral-dark/50"
                          }`}
                        >
                          <option value="">— empty —</option>

                          {/* Whoever is in the slot now stays selectable even if
                              they no longer qualify for it — archived, or placed
                              before the role rule existed. Dropping them would
                              blank the control and silently discard the
                              assignment the next time anything else on this
                              shift was edited. */}
                          {filled && (!filled.is_active || mismatched) ? (
                            <option value={filled.staff_id}>
                              {filled.full_name} · {ROLE_SPECS[filled.role].singular}
                              {!filled.is_active ? " (archived)" : ""}
                              {mismatched ? " — does not hold this role" : ""}
                            </option>
                          ) : null}

                          {eligible.map((person) => {
                            const elsewhere = placed.get(person.id);
                            const isHere =
                              elsewhere?.role === role &&
                              elsewhere.slot_index === slotIndex;

                            return (
                              <option key={person.id} value={person.id}>
                                {person.full_name} · {ROLE_SPECS[person.role].singular}
                                {elsewhere && !isHere ? " · already on this shift" : ""}
                              </option>
                            );
                          })}
                        </select>

                        {mismatched && filled ? (
                          <span className="text-xs font-semibold text-brand-accent">
                            {filled.full_name} is a{" "}
                            {ROLE_SPECS[filled.role].singular.toLowerCase()}, not a{" "}
                            {ROLE_SPECS[role].singular.toLowerCase()}. Pick a replacement.
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}
