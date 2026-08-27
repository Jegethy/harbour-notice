"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveStaffAction } from "@/app/admin/actions";
import { PhotoField } from "@/components/admin/PhotoField";
import { ROLES, ROLE_SPECS } from "@/lib/board/roles";
import { photoUrl } from "@/lib/board/photo";
import type { StaffRow } from "@/lib/types/database";

/**
 * Add or edit one member of staff.
 *
 * Uses the native <dialog> element, which brings focus trapping, Escape to
 * close and inert background content without hand-rolling any of it.
 *
 * Submission goes through useTransition rather than useActionState because the
 * photograph is a Blob held in component state, not a value the form element
 * knows about — so the FormData is assembled here and the success path can close
 * the dialog directly in the async callback.
 */
export function StaffDialog({
  person,
  open,
  onClose,
  onSaved,
}: {
  /** Null when adding somebody new. */
  person: StaffRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setError(null);
      setPhoto(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function submit() {
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    if (photo) formData.set("photo", photo, "photo.jpg");

    startTransition(async () => {
      const result = await saveStaffAction(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      setPhoto(null);
      onSaved(result.notice ?? "Saved.");
      onClose();
    });
  }

  const existingPhoto =
    person?.photo_path && person.photo_updated_at
      ? photoUrl(person.id, person.photo_updated_at)
      : null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-[min(34rem,92vw)] rounded-2xl bg-neutral-light p-0 text-neutral-dark backdrop:bg-black/50"
    >
      <form
        ref={formRef}
        action={submit}
        // Stop Enter in the name field from submitting before a role is chosen.
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
          }
        }}
        className="flex flex-col gap-5 p-6"
      >
        <header>
          <h2 className="text-xl font-bold text-brand-primary">
            {person ? `Edit ${person.full_name}` : "Add a member of staff"}
          </h2>
          <p className="mt-1 text-sm text-neutral-dark/70">
            Adding someone here does not put them on a board. They appear when
            somebody swaps them in on the floor, or when you roster them.
          </p>
        </header>

        {person ? <input type="hidden" name="id" value={person.id} /> : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Full name</span>
          <input
            type="text"
            name="full_name"
            required
            maxLength={80}
            autoFocus
            defaultValue={person?.full_name ?? ""}
            disabled={pending}
            className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-lg outline-none focus:border-brand-primary"
          />
          <span className="text-xs text-neutral-dark/60">
            Shown on the board exactly as typed — use the name residents and
            families know them by.
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Usual role</legend>

          <div className="flex flex-col gap-2">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 has-checked:border-brand-primary"
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  required
                  disabled={pending}
                  defaultChecked={person ? person.role === role : role === "CARE_ASSISTANT"}
                  className="h-4 w-4 accent-brand-primary"
                />
                <span className="font-semibold">{ROLE_SPECS[role].singular}</span>
              </label>
            ))}
          </div>

          <p className="text-xs text-neutral-dark/60">
            This decides which section of the board lists them first. It does not
            stop them covering another role — the swap screen can still find
            them under &ldquo;Show all staff&rdquo;.
          </p>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Photo</span>
          <PhotoField
            currentUrl={existingPhoto}
            fullName={person?.full_name ?? ""}
            disabled={pending}
            onChange={setPhoto}
          />
        </div>

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
            disabled={pending}
            className="rounded-lg bg-brand-primary px-6 py-3 text-base font-bold text-brand-cream transition-colors hover:bg-brand-deep disabled:opacity-60"
          >
            {pending ? "Saving…" : person ? "Save changes" : "Add to staff list"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
