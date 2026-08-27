/**
 * The shape of the board.
 *
 * Client-safe on purpose — no `server-only`, no imports. The board component,
 * the swap modal and the admin rota grid all need the same answer to "how many
 * slots, in what order, called what", and three copies of that would drift.
 *
 * These capacities mirror role_capacity() in 0001_init.sql. Change one and you
 * must change the other; the CHECK constraint will reject writes that disagree,
 * which is the intended way to find out.
 */

export const ROLES = ["NURSE", "SENIOR_CARER", "CARE_ASSISTANT"] as const;

export type Role = (typeof ROLES)[number];

export interface RoleSpec {
  /** Section heading on the board. */
  label: string;
  /** Heading when exactly one person fills the section. */
  singular: string;
  /** Slots the section holds. Mirrors role_capacity() in SQL. */
  capacity: number;
  /**
   * Most cards to put on one row before wrapping.
   *
   * Not the same as capacity: five assistants across a portrait tablet gives
   * each photo about 150px, which is unreadable from the far end of a corridor.
   * Three to a row and wrap is legible; the section grows a row instead.
   */
  perRow: number;
  /**
   * Share of leftover vertical space this section takes.
   *
   * The Nurse in Charge is the one face someone crossing the floor needs to
   * find, so the section is weighted to stay largest even when the board is
   * nearly empty.
   */
  weight: number;
}

export const ROLE_SPECS: Record<Role, RoleSpec> = {
  NURSE: {
    label: "Nurse in Charge",
    singular: "Nurse in Charge",
    capacity: 1,
    perRow: 1,
    weight: 5,
  },
  SENIOR_CARER: {
    label: "Senior Carers",
    singular: "Senior Carer",
    capacity: 3,
    perRow: 3,
    weight: 3,
  },
  CARE_ASSISTANT: {
    label: "Care Assistants",
    singular: "Care Assistant",
    capacity: 5,
    perRow: 3,
    weight: 4,
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Heading text that reads correctly when a section holds exactly one person. */
export function sectionHeading(role: Role, filled: number): string {
  const spec = ROLE_SPECS[role];
  return filled === 1 ? spec.singular : spec.label;
}

/** "Senior Carer" — for prose about one person, e.g. in the swap modal. */
export function roleNoun(role: Role): string {
  return ROLE_SPECS[role].singular;
}

/**
 * Initials for the placeholder disc shown when someone has no photograph.
 *
 * Two letters at most: "Mary-Anne O'Donnell" gives MO, not MAO. Longer strings
 * shrink the type until it stops reading as a face-sized token.
 */
export function initialsOf(fullName: string): string {
  const words = fullName
    .split(/[\s-]+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
