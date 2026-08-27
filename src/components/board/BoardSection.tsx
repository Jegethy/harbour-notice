"use client";

import { AddSlotTile, StaffCard } from "@/components/board/StaffCard";
import { ROLE_SPECS, roleNoun, sectionHeading, type Role } from "@/lib/board/roles";
import type { BoardSlot } from "@/lib/types/database";

/**
 * One band of the board.
 *
 * Two rules do the work here.
 *
 * **Sections share the height.** A section with people takes a share of the
 * screen in proportion to its weight, so the Nurse in Charge stays the biggest
 * face on the wall; a section with nobody in it shrinks to its heading and one
 * line of text and gives its space away. On a floor running one nurse and two
 * assistants, those three photographs grow to fill the screen rather than
 * sitting small above a stretch of empty maroon. That is what makes the fixed
 * capacities a ceiling rather than a requirement.
 *
 * **A section is always exactly one row.** Care assistants wrapping onto a
 * second row halves the height of every photograph in the section and leaves a
 * ragged gap beside the last one. Five across a portrait tablet is narrow, but
 * narrow and legible beats two short rows.
 *
 * The count is deliberately not displayed. "3 of 5" on a wall a visitor walks
 * past reads as understaffed, when a full complement is the exception rather
 * than the expectation — the board says who is on, not who is missing.
 */
export function BoardSection({
  role,
  slots,
  unlocked,
  onSelect,
}: {
  role: Role;
  slots: BoardSlot[];
  unlocked: boolean;
  onSelect: (target: SlotTarget) => void;
}) {
  const spec = ROLE_SPECS[role];
  const filled = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const hasRoom = filled.length < spec.capacity;
  const showAddTile = unlocked && hasRoom;

  // The lowest index nobody is standing in. Filling gaps rather than appending
  // keeps positions stable across a handover: replace the person in slot 0 and
  // everyone else stays where they were on the wall.
  const takenIndices = new Set(filled.map((slot) => slot.slot_index));
  const nextFreeIndex = Array.from({ length: spec.capacity }, (_, index) => index).find(
    (index) => !takenIndices.has(index),
  );

  const tiles = filled.length + (showAddTile ? 1 : 0);

  if (tiles === 0) {
    return (
      <section className="shrink-0">
        <SectionHeading role={role} filled={0} />
        <p className="rounded-xl border border-dashed border-[var(--board-line)] px-4 py-2 text-center text-base font-medium text-[var(--board-ink-dim)]">
          {role === "NURSE"
            ? "No nurse in charge recorded"
            : `No ${roleNoun(role).toLowerCase()}s recorded`}
        </p>
      </section>
    );
  }

  return (
    <section
      className="flex min-h-0 flex-col"
      // Grows in proportion to the section's weight, but may shrink below its
      // content if the board is unusually full.
      style={{ flex: `${spec.weight} 1 0%` }}
    >
      <SectionHeading role={role} filled={filled.length} />

      {/* --card-max caps how wide any one card may get; see globals.css. */}
      <div
        className="board-row flex min-h-0 flex-1 items-stretch justify-center"
        style={{ "--card-max": spec.maxCardWidth } as React.CSSProperties}
      >
        {filled.map((slot) => (
          <StaffCard
            key={`${slot.role}-${slot.slot_index}`}
            staffId={slot.staff_id}
            fullName={slot.full_name}
            photoUpdatedAt={slot.photo_updated_at}
            hasPhoto={slot.has_photo}
            editable={unlocked}
            onSelect={() => onSelect({ role, slotIndex: slot.slot_index, current: slot })}
          />
        ))}

        {showAddTile && nextFreeIndex !== undefined ? (
          <AddSlotTile
            label={`Add ${roleNoun(role).toLowerCase()}`}
            onSelect={() => onSelect({ role, slotIndex: nextFreeIndex, current: null })}
          />
        ) : null}
      </div>
    </section>
  );
}

export interface SlotTarget {
  role: Role;
  slotIndex: number;
  /** Who is there now, for the modal's "remove" option. Null when adding. */
  current: BoardSlot | null;
}

function SectionHeading({ role, filled }: { role: Role; filled: number }) {
  return (
    <h2 className="mb-1.5 shrink-0 px-0.5 text-sm font-bold uppercase tracking-[0.12em] text-[var(--board-ink-dim)] sm:text-base">
      {sectionHeading(role, filled)}
    </h2>
  );
}
