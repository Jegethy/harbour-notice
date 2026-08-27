/**
 * Check the board's card geometry without opening a browser.
 *
 *   npm run check:layout
 *
 * The board sizes every card from three competing bounds (see the .board-row
 * note in globals.css), and the interesting failures are not visual glitches —
 * they are a photograph coming out wider than it is tall, or the Nurse in Charge
 * ending up narrower than a care assistant. Both are easy to introduce by
 * nudging one number in ROLE_SPECS, and neither shows up on the one window size
 * you happen to have open.
 *
 * So this reimplements the same arithmetic over a spread of real screen shapes
 * and asserts the two invariants that matter:
 *
 *   1. every photograph is portrait — width ÷ height <= 1;
 *   2. nurse cards are wider than senior carer cards, which are wider than care
 *      assistant cards.
 *
 * It mirrors the CSS rather than executing it, so it cannot catch a mistake in
 * the CSS itself — only a bad set of numbers in ROLE_SPECS. Keep the constants
 * below in step with globals.css and the board components if those change.
 */

import { ROLES, ROLE_SPECS, type Role } from "../src/lib/board/roles";

/** Must match BoardClient's portrait cap. */
const PANEL_RATIO = 0.72;

/** Measured from the rendered board; approximate, and only used for ranking. */
const CHROME = {
  padX: { sm: 40, base: 24 },
  padY: { sm: 32, base: 24 },
  rowGap: { sm: 12, base: 8 },
  sectionGap: { sm: 16, base: 12 },
  header: { sm: 68, base: 60 },
  heading: { sm: 39, base: 35 },
};

const SCREENS: [name: string, width: number, height: number][] = [
  ["desktop 2058x1306", 2058, 1306],
  ["desktop 1920x1080", 1920, 1080],
  ["narrow 502x1306", 502, 1306],
  ["10in tablet portrait 800x1280", 800, 1280],
  ["iPad portrait 768x1024", 768, 1024],
  ["tablet 1200x1920", 1200, 1920],
  ["short laptop 1440x760", 1440, 760],
];

interface Measured {
  cardWidth: number;
  photoRatio: number;
  rowFill: number;
}

function measure(width: number, height: number): Record<Role, Measured> {
  const sm = width >= 640;
  const pick = <T,>(v: { sm: T; base: T }) => (sm ? v.sm : v.base);

  const panel = Math.min(width, PANEL_RATIO * height) - pick(CHROME.padX);
  const rows =
    height -
    pick(CHROME.padY) -
    pick(CHROME.header) -
    ROLES.length * pick(CHROME.heading) -
    (ROLES.length - 1) * pick(CHROME.sectionGap);

  const totalWeight = ROLES.reduce((sum, role) => sum + ROLE_SPECS[role].weight, 0);
  const gap = pick(CHROME.rowGap);

  return Object.fromEntries(
    ROLES.map((role) => {
      const spec = ROLE_SPECS[role];
      const count = spec.capacity;
      const rowHeight = (spec.weight / totalWeight) * rows;

      // The three bounds, smallest wins — as in the CSS.
      const byFlex = (panel - (count - 1) * gap) / count;
      const byWidth = (parseFloat(spec.maxCardWidth) / 100) * panel;
      const byRatio = spec.maxCardRatio * rowHeight;
      const cardWidth = Math.min(byFlex, byWidth, byRatio);

      // Name bar: clamp(0.95rem, 9cqw, 2.6rem) type plus 2.5cqw padding.
      const font = Math.min(Math.max(15.2, 0.09 * cardWidth), 41.6);
      const photoHeight = rowHeight - (font * 1.15 + 0.05 * cardWidth);

      return [
        role,
        {
          cardWidth,
          photoRatio: cardWidth / photoHeight,
          rowFill: (count * cardWidth + (count - 1) * gap) / panel,
        },
      ];
    }),
  ) as Record<Role, Measured>;
}

let failures = 0;

for (const [name, width, height] of SCREENS) {
  const measured = measure(width, height);
  console.log(`\n${name}`);

  for (const role of ROLES) {
    const { cardWidth, photoRatio, rowFill } = measured[role];
    const portrait = photoRatio <= 1;
    if (!portrait) failures += 1;

    console.log(
      `  ${role.padEnd(15)} ${String(Math.round(cardWidth)).padStart(4)}px wide` +
        `   photo ${photoRatio.toFixed(2)}:1 ${portrait ? "portrait" : "LANDSCAPE — too wide"}` +
        `   fills ${(rowFill * 100).toFixed(0)}% of row`,
    );
  }

  const ordered =
    measured.NURSE.cardWidth > measured.SENIOR_CARER.cardWidth &&
    measured.SENIOR_CARER.cardWidth > measured.CARE_ASSISTANT.cardWidth;

  if (!ordered) {
    failures += 1;
    console.log("  *** hierarchy inverted: a junior card is wider than a senior one");
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). Adjust maxCardRatio / weight in src/lib/board/roles.ts.`);
  process.exit(1);
}

console.log("\nAll screens: photographs portrait, hierarchy intact.");
