"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteStaffAction, setStaffActiveAction } from "@/app/admin/actions";
import { StaffDialog } from "@/components/admin/StaffDialog";
import { ROLE_SPECS, initialsOf } from "@/lib/board/roles";
import { photoUrl } from "@/lib/board/photo";
import type { StaffRow } from "@/lib/types/database";

/**
 * The staff list.
 *
 * Archived people stay on screen behind a toggle rather than disappearing.
 * Somebody who left and came back is common in care work, and "restore" is a
 * great deal better than re-typing a record and re-taking a photograph — and it
 * keeps the same person's history joined up rather than split across two rows.
 */
export function StaffTable({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<StaffRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = staff.filter((person) => person.is_active);
  const archived = staff.filter((person) => !person.is_active);
  const shown = showArchived ? archived : active;

  function setActive(person: StaffRow, next: boolean) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("staff_id", person.id);
      formData.set("active", String(next));

      const result = await setStaffActiveAction(formData);

      if (result.error) setError(result.error);
      else {
        setError(null);
        setNotice(result.notice ?? null);
        router.refresh();
      }
    });
  }

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">Staff</h1>
          <p className="mt-1 text-sm text-neutral-dark/70">
            Everyone who can appear on a duty board.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-base font-bold text-brand-cream shadow-sm transition-colors hover:bg-brand-deep"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Add staff
        </button>
      </header>

      <div className="mb-4 flex gap-1 border-b-2 border-neutral-dark/10">
        <Tab active={!showArchived} onClick={() => setShowArchived(false)}>
          On the staff list ({active.length})
        </Tab>
        {archived.length > 0 ? (
          <Tab active={showArchived} onClick={() => setShowArchived(true)}>
            Archived ({archived.length})
          </Tab>
        ) : null}
      </div>

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

      {shown.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
          {showArchived
            ? "Nobody is archived."
            : "No staff yet. Add the nurses, senior carers and care assistants who work on these floors."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-4 rounded-xl border border-neutral-dark/10 bg-white p-3 shadow-sm"
            >
              <Avatar person={person} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-neutral-dark">
                  {person.full_name}
                </p>
                <p className="text-sm text-neutral-dark/60">
                  {ROLE_SPECS[person.role].singular}
                  {person.photo_path ? "" : " · no photo"}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {person.is_active ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEditing(person);
                        setDialogOpen(true);
                      }}
                      className="rounded-lg border-2 border-neutral-dark/20 px-3 py-1.5 text-sm font-bold text-neutral-dark disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setActive(person, false)}
                      className="text-xs font-bold text-neutral-dark/60 underline disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setActive(person, true)}
                      className="rounded-lg border-2 border-status-ok px-3 py-1.5 text-sm font-bold text-status-ok disabled:opacity-50"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDeleting(person)}
                      className="text-xs font-bold text-brand-accent underline disabled:opacity-50"
                    >
                      Delete permanently
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <StaffDialog
        person={editing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={(message) => {
          setNotice(message);
          setError(null);
          router.refresh();
        }}
      />

      <DeleteStaffDialog
        person={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(message) => {
          setNotice(message);
          setError(null);
          router.refresh();
        }}
      />
    </section>
  );
}

function Tab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`-mb-0.5 border-b-4 px-4 py-2 text-sm font-bold transition-colors ${
        active
          ? "border-brand-primary text-brand-primary"
          : "border-transparent text-neutral-dark/50"
      }`}
    >
      {children}
    </button>
  );
}

function Avatar({ person }: { person: StaffRow }) {
  const [failed, setFailed] = useState(false);
  const url =
    person.photo_path && person.photo_updated_at
      ? photoUrl(person.id, person.photo_updated_at)
      : null;

  if (!url || failed) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-base font-bold text-brand-primary">
        {initialsOf(person.full_name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- private proxied route.
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full object-cover object-top"
    />
  );
}

/**
 * Permanent deletion, gated behind typing CONFIRM.
 *
 * Only reachable from the archived tab, which is the point: the destructive
 * action is two deliberate steps away from a list of people who work here, and
 * the safe one — archiving — is the one sitting next to the Edit button.
 */
function DeleteStaffDialog({
  person,
  onClose,
  onDeleted,
}: {
  person: StaffRow | null;
  onClose: () => void;
  onDeleted: (notice: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (person && !dialog.open) {
      setConfirmation("");
      setError(null);
      dialog.showModal();
    } else if (!person && dialog.open) {
      dialog.close();
    }
  }, [person]);

  function submit() {
    if (!person) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("staff_id", person.id);
      formData.set("confirmation", confirmation);

      const result = await deleteStaffAction(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      onDeleted(result.notice ?? "Deleted.");
      onClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-[min(30rem,92vw)] rounded-2xl bg-neutral-light p-0 text-neutral-dark backdrop:bg-black/50"
    >
      {person ? (
        <form action={submit} className="flex flex-col gap-4 p-6">
          <h2 className="text-xl font-bold text-brand-primary">
            Delete {person.full_name} permanently?
          </h2>

          <p className="text-sm text-neutral-dark/80">
            This also deletes every record of the shifts they worked. If they have
            simply left, <strong>Restore then Archive</strong> keeps that history
            and hides them from the boards, which is almost always what you want.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">
              Type CONFIRM to delete this record
            </span>
            <input
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
              autoComplete="off"
              className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-lg outline-none focus:border-brand-accent"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg px-5 py-3 text-base font-bold text-neutral-dark/70 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || confirmation !== "CONFIRM"}
              className="rounded-lg bg-brand-accent px-6 py-3 text-base font-bold text-white disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
