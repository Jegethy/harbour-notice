"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The centre logo, on the board header.
 *
 * logo_nobg.png is transparent with a cream wordmark and a red leaf — it was
 * drawn for a dark background, so it sits directly on both the maroon day board
 * and the indigo night one with no panel behind it. The cream carries the
 * contrast; the red leaf is a mark rather than text, so the low red-on-maroon
 * ratio is not carrying meaning.
 *
 * The export has generous transparent margins — the wordmark occupies roughly
 * the middle half of the canvas. Rendered as a plain <img> those margins are
 * still layout, so the logo reserves far more vertical space than it appears
 * to use and everything below it looks pushed down.
 *
 * So the artwork is cropped in CSS: the wrapper takes the aspect ratio of the
 * visible artwork, and the image is positioned inside it so the transparent
 * border falls outside. The element's box is then the logo you can actually
 * see, and normal spacing behaves normally.
 *
 * ARTWORK is measured from the file, not guessed. If you replace the artwork,
 * re-measure the bounding box of the visible pixels and update these numbers,
 * or the crop will clip the wordmark.
 */
const ARTWORK = {
  imageWidth: 1053,
  imageHeight: 1024,
  x: 210,
  y: 211,
  width: 628,
  height: 562,
};

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;

export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`flex flex-col justify-center text-center ${className}`}>
        <p className="font-serif text-5xl font-bold leading-none tracking-tight text-brand-cream">
          Harbour
        </p>
        <p className="mt-3 text-lg font-semibold uppercase tracking-[0.28em] text-brand-cream">
          Care Centre
        </p>
        <p className="mt-1 text-sm uppercase tracking-[0.34em] text-cream-dim">Portishead</p>
      </div>
    );
  }

  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={{ aspectRatio: `${ARTWORK.width} / ${ARTWORK.height}` }}
    >
      <Image
        src="/logo_nobg.png"
        alt="Harbour Care Centre, Portishead"
        width={ARTWORK.imageWidth}
        height={ARTWORK.imageHeight}
        priority
        /*
         * Served as-is. This is the brand mark on a screen that is lit all day,
         * and a lossy re-encode softens the serif wordmark at the size it is
         * drawn. 180KB, fetched once and cached.
         */
        unoptimized
        onError={() => setFailed(true)}
        className="absolute max-w-none"
        style={{
          width: percent(ARTWORK.imageWidth / ARTWORK.width),
          height: "auto",
          left: percent(-ARTWORK.x / ARTWORK.width),
          top: percent(-ARTWORK.y / ARTWORK.height),
        }}
      />
    </span>
  );
}
