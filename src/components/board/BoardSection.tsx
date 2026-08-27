"use client";

import { AddSlotTile, StaffCard } from "@/components/board/StaffCard";
import { ROLE_SPECS, roleNoun, sectionHeading, type Role } from "@/lib/board/roles";
import type { BoardSlot } from "@/lib/types/database";

export interface SlotTarget {
  role: Role;
  slotIndex: number;
  /** Who is there now, for the modal's "remove" option. Null when adding. */
  current: BoardSlot | null;
}

/**
 * One band of the board.
 *
 * The sizing rule is the important part. A section that has people takes a share
 * of the leftover height in proportion to its weight, so the Nurse in Charge
 * stays the biggest face on the wall; a section with nobody in it shrinks to its
 * heading and one line of text and gives its space to the sections that do. On a
 * floor running one nurse and two assistants, those three photographs grow to
 * fill the screen rather than sitting small above a stretch of empty maroon.
 *
 * That is what makes the fixed capacities — one, three, five — a layout ceiling
 * rather than a layout requirement.
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

  const tileCount = filled.length + (showAddTile ? 1 : 0);

  // Never a single full-width tile for a section that only holds an add button;
  // it would read as the most important thing on the board.
  const columns = Math.min(spec.perRow, Math.max(tileCount, spec.capacity > 1 ? 2 : 1));

  if (tileCount === 0) {
    return (
      <section className="shrink-0">
        <SectionHeading role={role} filled={0} />
        <p className="rounded-xl border border-dashed border-[var(--board-line)] px-4 py-2.5 text-center text-base font-medium text-[var(--board-ink-dim)] sm:text-lg">
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
      // Grows in proportion to the section's weight, but is allowed to shrink
      // below its content if the board is unusually full.
      style={{ flex: `${spec.weight} 1 0%` }}
    >
      <SectionHeading role={role} filled={filled.length} />

      <div
        className="grid min-h-0 flex-1 gap-2 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {filled.map((slot) => (
          <StaffCard
            key={`${slot.role}-${slot.slot_index}`}
            staffId={slot.staff_id}
            fullName={slot.full_name}
            photoUpdatedAt={slot.photo_updated_at}
            hasPhoto={slot.has_photo}
            editable={unlocked}
            onSelect={() =>
              onSelect({ role, slotIndex: slot.slot_index, current: slot })
            }
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

function SectionHeading({ role, filled }: { role: Role; filled: number }) {
  const spec = ROLE_SPECS[role];

  return (
    <h2 className="mb-1.5 flex shrink-0 items-baseline gap-2 px-0.5">
      <span className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--board-ink-dim)] sm:text-base">
        {sectionHeading(role, filled)}
      </span>
      {/* Only worth showing where "how many are on" is a real question. The
          nurse section is always one person or nobody, and a "1 of 1" beside it
          is noise. */}
      {spec.capacity > 1 && filled > 0 ? (
        <span className="text-xs font-semibold tabular-nums text-[var(--board-ink-dim)]/70">
          {filled} of {spec.capacity}
        </span>
      ) : null}
    </h2>
  );
}
