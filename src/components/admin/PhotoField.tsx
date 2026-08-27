"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The longest edge of a stored photograph, in pixels.
 *
 * The largest a face is ever drawn is the Nurse in Charge card on a portrait
 * tablet, which is a few hundred pixels across. 800 leaves room for a
 * higher-density screen and for the crop that object-cover applies, and lands a
 * typical phone photo at somewhere around 80KB — small enough that a board
 * showing nine faces on care-home wifi paints immediately.
 */
const MAX_EDGE = 800;
const JPEG_QUALITY = 0.85;

/**
 * Photo picker that downscales in the browser before anything is uploaded.
 *
 * This is done here rather than on the server for a practical reason: the
 * photographs come off a phone, at eight megapixels and four megabytes each.
 * Uploading that and resizing server-side would mean a native image library on
 * a Windows box, and a first-run failure mode that reads as "the photo just
 * doesn't work". A canvas is already in the browser, needs no dependency, and
 * moves the cost to the one machine that is definitely idle.
 *
 * It also means the bucket only ever holds what the board actually needs, so
 * nothing has to be cleaned up later.
 */
export function PhotoField({
  currentUrl,
  fullName,
  disabled,
  onChange,
}: {
  /** Existing photo, if this person has one. */
  currentUrl: string | null;
  fullName: string;
  disabled?: boolean;
  onChange: (blob: Blob | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it is replaced or the dialog closes, or every
  // photo picked in a session stays in memory until the tab is closed.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const blob = await downscale(file);
      const url = URL.createObjectURL(blob);

      setPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });

      onChange(blob);
    } catch {
      setError("That image could not be read. Please try a different file.");
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const shown = preview ?? currentUrl;

  return (
    <div className="flex items-start gap-4">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-neutral-dark/15 bg-white">
        {shown ? (
          // A blob: URL or a private proxied route; next/image can optimise
          // neither.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-center text-xs font-semibold text-neutral-dark/40">
            No photo
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          onChange={(event) => void pick(event.target.files?.[0])}
          className="block w-full text-sm text-neutral-dark/70 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-brand-cream"
        />

        <p className="text-xs text-neutral-dark/60">
          A head-and-shoulders photo works best. It is resized automatically —
          upload straight from a phone.
          {fullName ? ` Shown on the board above ${fullName}.` : ""}
        </p>

        {busy ? <p className="text-xs font-semibold text-neutral-dark/70">Preparing…</p> : null}

        {error ? (
          <p role="alert" className="text-xs font-bold text-status-bad">
            {error}
          </p>
        ) : null}

        {preview ? (
          <button
            type="button"
            onClick={clear}
            className="self-start text-xs font-bold text-brand-accent underline"
          >
            Undo — keep the existing photo
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Read, shrink, re-encode.
 *
 * createImageBitmap handles EXIF orientation, which matters more than it
 * sounds: a photo taken in portrait on a phone is stored landscape with a
 * rotation flag, and drawing it to a canvas without honouring that puts every
 * face on the board on its side.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");

  // A transparent PNG would otherwise flatten onto black once encoded as JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
