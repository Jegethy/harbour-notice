"use client";

import { useEffect, useRef, useState } from "react";
import type { SlotTarget } from "@/components/board/BoardSection";
import { initialsOf, roleNoun } from "@/lib/board/roles";
import { photoUrl } from "@/lib/board/photo";
import type { AvailableStaffRow } from "@/lib/types/database";

/**
 * Pick who is standing in one slot.
 *
 * Opens on the section that was tapped and lists the people who hold that role —
 * and nobody else. A board saying a care assistant is Nurse in Charge is stating
 * something untrue about who is clinically accountable for the floor, so the
 * list simply does not offer it. The filtering happens in available_staff(), so
 * a tablet is never sent the rest of the staff roll, and set_slot_at() refuses a
 * mismatch regardless of what asks. See 0003_role_restriction.sql.
 *
 * This outer component owns nothing but the <dialog>. Everything that has to be
 * fresh for each slot — the fetched list, the error, the in-flight save — lives
 * in SwapBody, which is keyed by the slot and so is remounted
 * rather than reset. Resetting that state from an effect watching `target` is
 * the alternative, and it is a cascading render that briefly shows the previous
 * slot's list under the new slot's heading.
 */
export function SwapModal({
  floor,
  target,
  onClose,
  onChanged,
  onLocked,
}: {
  floor: string;
  target: SlotTarget | null;
  onClose: () => void;
  onChanged: () => void;
  /** The editing window closed mid-swap; the board re-prompts for the PIN. */
  onLocked: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = target !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[88dvh] w-[min(40rem,94vw)] rounded-3xl bg-[var(--board-surface)] p-0 text-[var(--board-ink)] backdrop:bg-black/70"
    >
      {target ? (
        <SwapBody
          key={`${target.role}-${target.slotIndex}`}
          floor={floor}
          target={target}
          onClose={onClose}
          onChanged={onChanged}
          onLocked={onLocked}
        />
      ) : null}
    </dialog>
  );
}

function SwapBody({
  floor,
  target,
  onClose,
  onChanged,
  onLocked,
}: {
  floor: string;
  target: SlotTarget;
  onClose: () => void;
  onChanged: () => void;
  onLocked: () => void;
}) {
  const [staff, setStaff] = useState<AvailableStaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const role = target.role;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/board/${floor}/staff?role=${encodeURIComponent(role)}`,
          { cache: "no-store" },
        );

        if (response.status === 403) {
          if (!cancelled) onLocked();
          return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as { staff: AvailableStaffRow[] };
        if (!cancelled) setStaff(payload.staff);
      } catch {
        if (!cancelled) setError("Could not load the staff list. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [floor, role, onLocked]);

  async function choose(staffId: string | null) {
    if (saving) return;

    setSaving(staffId ?? "clear");
    setError(null);

    try {
      const response = await fetch(`/api/board/${floor}/slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: target.role,
          slot_index: target.slotIndex,
          staff_id: staffId,
        }),
      });

      if (response.status === 403) {
        onLocked();
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Could not save that change. Please try again.");
        return;
      }

      onChanged();
      onClose();
    } catch {
      setError("Could not save that change. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  const currentId = target.current?.staff_id ?? null;

  return (
    <div className="flex max-h-[88dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--board-line)] px-6 py-4">
        <div>
          <h2 className="text-2xl font-bold">
            {target.current
              ? `Replace ${target.current.full_name}`
              : `Add ${roleNoun(target.role).toLowerCase()}`}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--board-ink-dim)]">
            Tap whoever is taking over.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1 rounded-full px-3 py-2 text-sm font-bold text-[var(--board-ink-dim)]"
        >
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-brand-cream px-4 py-3 text-sm font-bold text-brand-primary"
          >
            {error}
          </p>
        ) : null}

        {staff === null && !error ? (
          <p className="py-8 text-center text-[var(--board-ink-dim)]">Loading…</p>
        ) : null}

        {staff !== null ? (
          staff.length === 0 ? (
            // Distinguished from "no staff at all": the actionable fact is which
            // role is missing, and that it is fixed in the admin panel rather
            // than on this screen.
            <p className="py-8 text-center text-[var(--board-ink-dim)]">
              Nobody on the staff list is a {roleNoun(target.role).toLowerCase()}. Add one
              in the admin panel.
            </p>
          ) : (
            <PersonGrid
              people={staff}
              saving={saving}
              currentId={currentId}
              onChoose={choose}
            />
          )
        ) : null}
      </div>

      {/* Emptying a slot is a first-class action, not an afterthought. When
          somebody goes home and nobody replaces them, the honest board is a
          shorter one — the alternative is a stale face on the wall, which is the
          failure this whole screen exists to prevent. */}
      {target.current ? (
        <footer className="shrink-0 border-t border-[var(--board-line)] px-6 py-4">
          <button
            type="button"
            onClick={() => void choose(null)}
            disabled={saving !== null}
            className="w-full rounded-xl border-2 border-[var(--board-line)] px-4 py-3 text-base font-bold text-[var(--board-ink)] disabled:opacity-50"
          >
            {saving === "clear"
              ? "Removing…"
              : `Remove ${target.current.full_name} — nobody covering`}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function PersonGrid({
  people,
  saving,
  currentId,
  onChoose,
}: {
  people: AvailableStaffRow[];
  saving: string | null;
  currentId: string | null;
  onChoose: (staffId: string) => void;
}) {
  if (people.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {people.map((person) => {
        const isCurrent = person.staff_id === currentId;

        return (
          <li key={person.staff_id}>
            <button
              type="button"
              onClick={() => onChoose(person.staff_id)}
              disabled={saving !== null || isCurrent}
              className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition-transform active:scale-[0.97] disabled:active:scale-100 ${
                isCurrent
                  ? "border-[var(--board-line)] opacity-45"
                  : "border-transparent bg-[var(--board-surface-2)]"
              }`}
            >
              <Thumbnail person={person} />

              <span className="w-full truncate text-sm font-bold text-[var(--board-ink)]">
                {person.full_name}
              </span>

              {saving === person.staff_id ? (
                <Badge>Saving…</Badge>
              ) : isCurrent ? (
                <Badge>Already here</Badge>
              ) : person.on_this_floor ? (
                <Badge>Move from another section</Badge>
              ) : person.on_other_floor ? (
                <Badge>On {person.on_other_floor}</Badge>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Thumbnail({ person }: { person: AvailableStaffRow }) {
  const [failed, setFailed] = useState(false);

  if (!person.has_photo || failed) {
    return (
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--board-bg)] text-xl font-bold text-[var(--board-ink-dim)]">
        {initialsOf(person.full_name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see StaffCard.
    <img
      src={photoUrl(person.staff_id, person.photo_updated_at)}
      alt=""
      onError={() => setFailed(true)}
      className="h-20 w-20 rounded-full object-cover object-top"
      draggable={false}
    />
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--board-bg)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--board-ink-dim)]">
      {children}
    </span>
  );
}
