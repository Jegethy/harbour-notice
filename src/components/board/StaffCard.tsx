"use client";

import { useState } from "react";
import { initialsOf } from "@/lib/board/roles";
import { photoUrl } from "@/lib/board/photo";

/**
 * One face on the board.
 *
 * The photo fills whatever rectangle the layout hands the card, cropped with
 * object-cover. Nothing here fixes an aspect ratio or a pixel size on purpose:
 * the sections divide the screen between them, so a floor running two care
 * assistants gets two large photographs and a floor running five gets five
 * smaller ones, with no breakpoints and no scrolling either way.
 *
 * The name sits in a band under the photo rather than over it. Overlaid text
 * needs a scrim to stay legible against an unpredictable photograph, and a
 * scrim dark enough to guarantee contrast covers the chin of every picture.
 */
export function StaffCard({
  staffId,
  fullName,
  photoUpdatedAt,
  hasPhoto,
  editable,
  onSelect,
}: {
  staffId: string;
  fullName: string;
  photoUpdatedAt: string | null;
  hasPhoto: boolean;
  /** True while the editing window is open: shows the swap affordance. */
  editable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="name-fit group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[var(--board-line)] bg-[var(--board-surface)] text-left transition-transform active:scale-[0.98]"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Portrait
          staffId={staffId}
          fullName={fullName}
          photoUpdatedAt={photoUpdatedAt}
          hasPhoto={hasPhoto}
        />

        {editable ? <SwapBadge /> : null}
      </div>

      <p
        className="shrink-0 truncate px-[4cqw] py-[2.5cqw] text-center font-bold leading-tight text-[var(--board-ink)]"
        style={{ fontSize: "clamp(0.95rem, 9cqw, 2.6rem)" }}
      >
        {fullName}
      </p>
    </button>
  );
}

/**
 * The photograph, or initials if there is none.
 *
 * Falls back on an error as well as on a missing file. A broken image icon on a
 * wall display looks like a fault in the system rather than a missing
 * photograph, and the initials disc is a perfectly good stand-in — the name
 * underneath is what people actually read.
 */
function Portrait({
  staffId,
  fullName,
  photoUpdatedAt,
  hasPhoto,
}: {
  staffId: string;
  fullName: string;
  photoUpdatedAt: string | null;
  hasPhoto: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // object-position sits at 28% rather than the top: in a card wider than it is
  // tall, "top" frames hair and background and cuts the face off below. 28% keeps
  // eyes and mouth in shot whatever shape the card ends up.
  if (!hasPhoto || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--board-surface-2)]">
        <span
          aria-hidden="true"
          className="font-bold tracking-wide text-[var(--board-ink-dim)]"
          style={{ fontSize: "clamp(1.5rem, 22cqw, 6rem)" }}
        >
          {initialsOf(fullName)}
        </span>
      </div>
    );
  }

  return (
    // next/image would route these through the optimiser, which cannot reach a
    // private bucket behind a device cookie. The upload is already downscaled
    // in the browser, so there is nothing left for the optimiser to do.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl(staffId, photoUpdatedAt)}
      alt=""
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-[center_28%]"
      draggable={false}
    />
  );
}

/** Only drawn while the board is unlocked, so the wall display stays clean. */
function SwapBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[var(--board-bg)]/85 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[var(--board-ink)]"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.5]">
        <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Swap
    </span>
  );
}

/**
 * The "add someone" tile.
 *
 * Appears only while the board is unlocked. On the wall the board shows the
 * people who are on duty and nothing else — a row of empty dashed boxes for the
 * five care assistants a floor almost never has would make every board look
 * permanently broken, and it is the one requirement the layout has to get
 * right: short-staffed is the normal case, not the exception.
 */
export function AddSlotTile({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="name-fit flex min-h-0 min-w-0 flex-col items-center justify-center gap-[2cqw] rounded-2xl border-2 border-dashed border-[var(--board-line)] bg-[var(--board-surface)]/40 text-[var(--board-ink-dim)] transition-transform active:scale-[0.98]"
    >
      <span aria-hidden="true" style={{ fontSize: "clamp(1.5rem, 16cqw, 3.5rem)" }} className="leading-none">
        +
      </span>
      <span className="px-2 text-center font-semibold leading-tight" style={{ fontSize: "clamp(0.7rem, 6cqw, 1.1rem)" }}>
        {label}
      </span>
    </button>
  );
}
