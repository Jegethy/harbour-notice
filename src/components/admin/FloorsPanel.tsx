"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteFloorAction, saveFloorAction } from "@/app/admin/actions";
import type { FloorRow } from "@/lib/types/database";

/**
 * Floors, and the web address each tablet is pointed at.
 *
 * The slug is exposed rather than hidden because it is operational: it is what
 * a tablet's home-screen bookmark contains and what somebody has to read out
 * over the phone when a board needs re-pairing. Renaming a floor is safe;
 * changing its address is not, and the form says so.
 */
export function FloorsPanel({ floors }: { floors: FloorRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<FloorRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<FloorRow | null>(null);
  const [confirmation, setConfirmation] = useState("");

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveFloorAction(formData);
      setError(result.error ?? null);
      setNotice(result.notice ?? null);
      if (!result.error) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirming) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", confirming.id);
      formData.set("confirmation", confirmation);

      const result = await deleteFloorAction(formData);
      setError(result.error ?? null);
      setNotice(result.notice ?? null);

      if (!result.error) {
        setConfirming(null);
        setConfirmation("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p
          role="status"
          className="rounded-lg border-2 border-status-ok bg-status-ok/10 px-4 py-3 text-sm font-semibold text-status-ok"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {floors.map((floor) => (
          <li
            key={floor.id}
            className="rounded-lg border border-neutral-dark/10 bg-white p-3"
          >
            {editing !== "new" && editing?.id === floor.id ? (
              <FloorForm floor={floor} pending={pending} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-neutral-dark">{floor.name}</p>
                  <p className="truncate font-mono text-xs text-neutral-dark/50">
                    /board/{floor.slug}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(floor)}
                  className="rounded-lg border-2 border-neutral-dark/20 px-3 py-1.5 text-sm font-bold"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(floor);
                    setConfirmation("");
                  }}
                  className="text-xs font-bold text-brand-accent underline"
                >
                  Delete
                </button>
              </div>
            )}

            {confirming?.id === floor.id ? (
              <div className="mt-3 rounded-lg border-2 border-brand-accent/40 bg-brand-accent/5 p-3">
                <p className="text-sm font-semibold text-neutral-dark">
                  Deleting {floor.name} removes every shift ever recorded on it, and
                  any tablet paired to it will need setting up again.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="Type CONFIRM"
                    autoComplete="off"
                    className="rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={remove}
                    disabled={pending || confirmation !== "CONFIRM"}
                    className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Delete floor
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-sm font-bold text-neutral-dark/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {editing === "new" ? (
        <div className="rounded-lg border border-neutral-dark/10 bg-white p-3">
          <FloorForm floor={null} pending={pending} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="self-start rounded-lg border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary"
        >
          + Add a floor
        </button>
      )}
    </div>
  );
}

function FloorForm({
  floor,
  pending,
  onSave,
  onCancel,
}: {
  floor: FloorRow | null;
  pending: boolean;
  onSave: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSave} className="flex flex-col gap-3">
      {floor ? <input type="hidden" name="id" value={floor.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
            Name shown on the board
          </span>
          <input
            type="text"
            name="name"
            required
            maxLength={60}
            defaultValue={floor?.name ?? ""}
            className="rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 font-semibold"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
            Sort order
          </span>
          <input
            type="number"
            name="sort_order"
            defaultValue={floor?.sort_order ?? 0}
            className="rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 font-semibold"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/60">
          Web address
        </span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm text-neutral-dark/50">/board/</span>
          <input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={40}
            defaultValue={floor?.slug ?? ""}
            className="flex-1 rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2 font-mono"
          />
        </div>
        <span className="text-xs text-neutral-dark/60">
          Lower-case letters, numbers and hyphens.
          {floor
            ? " Changing this strands any tablet already paired to this floor — it will need setting up again."
            : ""}
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-bold text-brand-cream disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-dark/60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
