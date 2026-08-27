/**
 * Hand-maintained mirror of supabase/migrations/0001_init.sql.
 *
 * Once the schema is pushed you can regenerate this file instead of editing it:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

import type { Role } from "@/lib/board/roles";
import type { Shift } from "@/lib/board/shift";

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type FloorRow = {
  id: string;
  /** URL segment: /board/<slug>. Constrained to [a-z0-9-] by the database. */
  slug: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type StaffRow = {
  id: string;
  full_name: string;
  /** Decides which slots they can fill. Enforced in set_slot_at() — see 0003. */
  role: Role;
  /** Object key in the private `staff-photos` bucket. NULL = show initials. */
  photo_path: string | null;
  photo_updated_at: string | null;
  /** false = archived. Hidden from pickers; historical rota rows survive. */
  is_active: boolean;
  created_at: string;
};

export type ShiftAssignmentRow = {
  id: string;
  floor_id: string;
  /** A night shift is dated by the day it starts. */
  shift_date: string;
  shift: Shift;
  role: Role;
  slot_index: number;
  staff_id: string;
  created_at: string;
  updated_at: string;
};

/** One filled slot, as board_snapshot() returns it. */
export type BoardSlot = {
  role: Role;
  slot_index: number;
  staff_id: string;
  full_name: string;
  photo_updated_at: string | null;
  has_photo: boolean;
};

/** The whole payload one tablet polls for. */
export type BoardSnapshot = {
  outcome: "OK";
  floor: { slug: string; name: string };
  shift_date: string;
  shift: Shift;
  /** Server time. The board's clock follows this, not the tablet's. */
  at: string;
  slots: BoardSlot[];
};

/**
 * A row in the swap modal.
 *
 * Only ever people who hold the role being filled — available_staff() filters
 * on it, so the tablet is never sent the rest of the staff roll. See
 * 0003_role_restriction.sql.
 */
export type AvailableStaffRow = {
  staff_id: string;
  full_name: string;
  role: Role;
  has_photo: boolean;
  photo_updated_at: string | null;
  /** Already somewhere on this board this shift — offered as a move, not a duplicate. */
  on_this_floor: boolean;
  /** Names of other floors they are already on tonight, or null. */
  on_other_floor: string | null;
};

/**
 * One filled slot on a planned shift, as the admin rota grid sees it.
 *
 * Carries is_active, unlike BoardSlot: the planner can be looking at a shift
 * that was filled in weeks ago, and somebody on it may have left since. The
 * board never has that problem — archiving removes people from future shifts —
 * so its payload does not carry the flag.
 */
export type RotaSlotRow = {
  role: Role;
  slot_index: number;
  staff_id: string;
  full_name: string;
  has_photo: boolean;
  photo_updated_at: string | null;
  is_active: boolean;
};

export type AppSettingsRow = {
  id: boolean;
  swap_pin_hash: string;
  swap_pin_updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      floors: {
        Row: FloorRow;
        Insert: Omit<FloorRow, "id" | "created_at"> &
          Partial<Pick<FloorRow, "id" | "created_at">>;
        Update: Partial<FloorRow>;
        Relationships: [];
      };
      staff: {
        Row: StaffRow;
        Insert: Omit<StaffRow, "id" | "created_at" | "is_active"> &
          Partial<Pick<StaffRow, "id" | "created_at" | "is_active">>;
        Update: Partial<StaffRow>;
        Relationships: [];
      };
      shift_assignments: {
        Row: ShiftAssignmentRow;
        Insert: Omit<ShiftAssignmentRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<ShiftAssignmentRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<ShiftAssignmentRow>;
        Relationships: [];
      };
      /** Never read or written directly; see set_swap_pin() / swap_pin_hash(). */
      app_settings: {
        Row: AppSettingsRow;
        Insert: AppSettingsRow;
        Update: Partial<AppSettingsRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      board_snapshot: {
        Args: { p_floor_slug: string };
        Returns: Json;
      };
      available_staff: {
        Args: { p_role: Role; p_floor_slug: string };
        Returns: AvailableStaffRow[];
      };
      set_slot: {
        Args: {
          p_floor_slug: string;
          p_role: Role;
          p_slot_index: number;
          p_staff_id: string | null;
        };
        Returns: Json;
      };
      set_slot_at: {
        Args: {
          p_floor_slug: string;
          p_shift_date: string;
          p_shift: Shift;
          p_role: Role;
          p_slot_index: number;
          p_staff_id: string | null;
        };
        Returns: Json;
      };
      rota_for: {
        Args: { p_floor_slug: string; p_shift_date: string; p_shift: Shift };
        Returns: RotaSlotRow[];
      };
      current_shift: {
        Args: { p_at?: string };
        Returns: { shift_date: string; shift: Shift }[];
      };
      swap_pin_hash: {
        Args: Record<never, never>;
        Returns: string | null;
      };
      swap_pin_status: {
        Args: Record<never, never>;
        Returns: string | null;
      };
      set_swap_pin: {
        Args: { p_hash: string };
        Returns: undefined;
      };
      role_capacity: {
        Args: { p_role: Role };
        Returns: number;
      };
    };
    Enums: {
      staff_role: Role;
      shift_name: Shift;
    };
    CompositeTypes: Record<never, never>;
  };
};
