/**
 * Shift naming and handover timing, for display only.
 *
 * Client-safe. Read the header of current_shift() in 0001_init.sql before
 * changing anything here: the database decides which shift the board is
 * showing, and nothing in this file is allowed to become a second opinion. What
 * lives here is presentation (labels, times) plus one scheduling hint — when the
 * next handover falls — used to line a refetch up with 08:00 and 20:00 instead
 * of catching it whenever the poll happens to land.
 *
 * If that hint is wrong the board is not wrong; the poll still corrects it
 * within a few seconds.
 */

export type Shift = "DAY" | "NIGHT";

export const HANDOVER_HOURS = [8, 20] as const;

export function isShift(value: unknown): value is Shift {
  return value === "DAY" || value === "NIGHT";
}

export function shiftLabel(shift: Shift): string {
  return shift === "DAY" ? "Day shift" : "Night shift";
}

/** "08:00 – 20:00" — shown under the shift badge so the board explains itself. */
export function shiftHours(shift: Shift): string {
  return shift === "DAY" ? "08:00 – 20:00" : "20:00 – 08:00";
}

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Local wall-clock time in Europe/London, as seconds since midnight.
 *
 * Intl rather than getHours(): a tablet set to the wrong timezone would
 * otherwise compute handover against its own idea of local time. This asks for
 * London specifically, and handles BST without a table of dates.
 */
function londonSecondsSinceMidnight(at: Date): number {
  const parts = londonParts.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  // "24" appears at exactly midnight in some engines; fold it back to 0.
  return (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
}

/**
 * Milliseconds until the next 08:00 or 20:00 London time.
 *
 * Always at least a second, so a caller scheduling a timeout from this can
 * never spin. Ignores the one hour a year that the clocks change on a handover
 * boundary — being an hour early to re-poll costs one extra request.
 */
export function msUntilNextHandover(at: Date = new Date()): number {
  const seconds = londonSecondsSinceMidnight(at);
  const boundaries = [8 * 3600, 20 * 3600, 32 * 3600];
  const next = boundaries.find((boundary) => boundary > seconds) ?? 32 * 3600;
  return Math.max(1000, (next - seconds) * 1000);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatBoardDate = (date: Date) => dateFormat.format(date);
export const formatBoardTime = (date: Date) => timeFormat.format(date);

/**
 * "Tuesday 26 August" from a plain `YYYY-MM-DD` shift date.
 *
 * Parsed as UTC midday rather than local midnight: a bare date string is
 * interpreted as UTC, and formatting UTC midnight back into a timezone west of
 * Greenwich lands on the previous day. Midday has no such edge.
 */
export function formatShiftDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00Z`));
}
