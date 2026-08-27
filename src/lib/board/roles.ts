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
   * Seniority. Somebody may fill a slot at or below their own rank, never above.
   *
   * Mirrors role_rank() in 0004_role_hierarchy.sql. Deliberately separate from
   * `capacity`: one is how many slots the board draws, the other is who may
   * stand in them.
   */
  rank: number;
  /**
   * The widest one card in this section may be, as a share of the row.
   *
   * A section is always a single row, so without a cap a lone card stretches the
   * full width of the board and `object-fit: cover` crops its photograph to a
   * letterbox strip of forehead. The cap keeps every card roughly portrait
   * however few people are on: one senior carer takes half the row, one care
   * assistant a third, and the remainder stays empty.
   *
   * It binds only when a section is emptier than its capacity. Five care
   * assistants each take a fifth of the row on their own, well under the cap.
   *
   * Even the Nurse in Charge is capped, at two thirds — a card spanning the
   * whole width of a board is not a portrait, it is a panorama, and the face
   * disappears out of the top and bottom of it. Two thirds still leaves it far
   * and away the largest card on the wall.
   */
  maxCardWidth: string;
  /**
   * The widest one card may be relative to its own height, as width ÷ height.
   *
   * The width cap above is a share of the row, which says nothing about how tall
   * the row happens to be. On a short, wide window a section is short, so a card
   * capped only by width is a letterbox and `object-fit: cover` crops the
   * photograph to a strip — which is why the board only looked right in a tall,
   * narrow window. This second cap is measured against the row's own height, so
   * a card stays portrait whatever shape the screen is; the leftover width just
   * becomes margin either side.
   *
   * Values are the card including its name bar, so the photograph above it comes
   * out a little more portrait again. The Nurse in Charge is the widest allowed,
   * which together with the tallest row keeps that card the largest on the wall.
   */
  maxCardRatio: number;
  /**
   * Share of leftover vertical space this section takes.
   *
   * The Nurse in Charge is the one face someone crossing the floor needs to
   * find, so that section is weighted to stay largest even when the board is
   * nearly empty.
   *
   * The three are closer together than the old 5/3/4 because the ratio cap now
   * turns height into width: a section given too little height produces cards
   * narrower than the ones below it, and the hierarchy inverts. 10/8/7 keeps
   * nurse wider than senior wider than assistant at every window shape tried.
   */
  weight: number;
}

export const ROLE_SPECS: Record<Role, RoleSpec> = {
  NURSE: {
    label: "Nurse in Charge",
    singular: "Nurse in Charge",
    capacity: 1,
    rank: 3,
    maxCardWidth: "66%",
    maxCardRatio: 0.85,
    weight: 11,
  },
  SENIOR_CARER: {
    label: "Senior Carers",
    singular: "Senior Carer",
    capacity: 3,
    rank: 2,
    maxCardWidth: "48%",
    maxCardRatio: 0.62,
    weight: 8,
  },
  CARE_ASSISTANT: {
    label: "Care Assistants",
    singular: "Care Assistant",
    capacity: 5,
    rank: 1,
    maxCardWidth: "32%",
    maxCardRatio: 0.52,
    weight: 7,
  },
};

/**
 * May this person stand in a slot for `slotRole`?
 *
 * Cover flows downward only: a senior carer taking a care assistant shift and a
 * nurse taking a senior carer shift are ordinary; a senior carer in the Nurse in
 * Charge slot would assert clinical accountability they do not hold.
 *
 * The database enforces the same rule in set_slot_at(), which is what makes it
 * true rather than merely offered — see 0004_role_hierarchy.sql. This copy
 * exists so the pickers can filter without a round trip.
 */
export function canFill(staffRole: Role, slotRole: Role): boolean {
  return ROLE_SPECS[staffRole].rank >= ROLE_SPECS[slotRole].rank;
}

/** True when they are covering from a more senior role rather than their own. */
export function isCovering(staffRole: Role, slotRole: Role): boolean {
  return staffRole !== slotRole;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Heading text that reads correctly when a section holds exactly one person.
 *
 * "Senior Carer" rather than "Senior Carers" when there is one. The board shows
 * no counts — a visitor reading "3 of 5 care assistants" reads it as
 * understaffed, when a full complement is the exception rather than the
 * expectation — so the heading is the only thing carrying number, and it should
 * at least agree with what is underneath it.
 */
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
