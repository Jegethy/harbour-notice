"use client";

import { useState } from "react";

/**
 * The centre's logo, top-left of every board.
 *
 * **To change the logo, replace `public/logo-board.png`.** Nothing else needs
 * touching: the artwork is drawn with `object-fit: contain` inside a fixed
 * height, so any shape or resolution fits without measuring it first. That is
 * deliberately unlike the visitor kiosk's version, which hard-codes the pixel
 * bounds of one specific export and silently clips anything else.
 *
 * The mark sits on a cream panel rather than straight on the board. The supplied
 * artwork is red and gold on white, and brand red on brand maroon measures
 * 1.8:1 — close to invisible at corridor distance, and worse again on the indigo
 * night board. A light panel keeps the brand colours as drawn and gives the same
 * contrast under both palettes, which is what a logo needs from a surface it
 * does not control.
 *
 * If you swap in artwork that is already light-on-transparent, set PANEL to
 * false and it will sit directly on the board.
 */

const LOGO_SRC = "/logo-board.png";
const PANEL = true;

export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  /*
   * A missing or unreadable file falls back to the wordmark set in type. The
   * board is on a wall all day: a broken-image icon reads as a fault in the
   * system, where the name set in the brand's own cream reads as a design.
   */
  if (failed) {
    return (
      <span className={`flex flex-col justify-center leading-none ${className}`}>
        <span className="font-serif text-xl font-bold tracking-tight text-[var(--board-ink)] sm:text-2xl">
          Harbour
        </span>
        <span className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-[var(--board-ink-dim)]">
          Care Centre
        </span>
      </span>
    );
  }

  return (
    <span
      className={`flex items-center justify-center ${
        PANEL ? "rounded-xl bg-brand-cream px-3 py-2" : ""
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the file is
          swappable by hand and its dimensions are deliberately not known here,
          which is exactly what next/image needs declared up front. */}
      <img
        src={LOGO_SRC}
        alt="Harbour Care Centre"
        onError={() => setFailed(true)}
        className="h-full w-auto object-contain"
        draggable={false}
      />
    </span>
  );
}
