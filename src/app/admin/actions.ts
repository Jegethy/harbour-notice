"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ROLE_SPECS, isRole, type Role } from "@/lib/board/roles";
import { isShift, type Shift } from "@/lib/board/shift";
import { hashPin, isValidPinShape } from "@/lib/board/unlock";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  notice?: string;
}

/** Where to send someone after signing in, without allowing an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

function clean(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email address and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately identical for a wrong password and an unknown address, so
    // this form cannot be used to discover which staff emails exist.
    return { error: "Those details were not recognised. Please try again." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export interface StaffResult {
  error?: string;
  notice?: string;
}

/** 2MB, matching the bucket's own limit. The browser downscales well below it. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Store one photograph and stamp the staff row.
 *
 * The object key is just the staff id, so replacing a photograph overwrites the
 * old one instead of accumulating orphans nothing will ever clean up. Cache
 * busting does not depend on the key being unique — the board's URL carries
 * photo_updated_at in a query string, which is what actually changes.
 */
async function storePhoto(
  supabase: ReturnType<typeof createAdminClient>,
  staffId: string,
  photo: File,
): Promise<string | null> {
  if (!PHOTO_TYPES.has(photo.type)) {
    return "Photos must be a JPEG, PNG or WebP image.";
  }

  if (photo.size > MAX_PHOTO_BYTES) {
    return "That photo is too large. Please choose a smaller image.";
  }

  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const path = `${staffId}.${extension}`;

  const { error } = await supabase.storage
    .from("staff-photos")
    .upload(path, photo, { upsert: true, contentType: photo.type });

  if (error) {
    console.error("[admin] photo upload failed", error);
    return "Could not save that photo. Please try again.";
  }

  // Clear any photo stored under a different extension, or the old file would
  // sit in the bucket forever with nothing pointing at it.
  const stale = ["jpg", "png", "webp"]
    .filter((candidate) => candidate !== extension)
    .map((candidate) => `${staffId}.${candidate}`);
  await supabase.storage.from("staff-photos").remove(stale);

  const { error: stampError } = await supabase
    .from("staff")
    .update({ photo_path: path, photo_updated_at: new Date().toISOString() })
    .eq("id", staffId);

  if (stampError) {
    console.error("[admin] photo stamp failed", stampError);
    return "The photo was uploaded but could not be linked. Please try again.";
  }

  return null;
}

/**
 * Create or update one staff member.
 *
 * The photo is optional on both paths: adding someone before their picture has
 * been taken is normal, and the board falls back to their initials, which is a
 * good deal better than not listing them at all.
 */
export async function saveStaffAction(formData: FormData): Promise<StaffResult> {
  await requireAdmin();

  const id = clean(formData, "id");
  const fullName = clean(formData, "full_name");
  const role = String(formData.get("role") ?? "");
  const photo = formData.get("photo");

  if (!fullName) return { error: "Please enter their full name." };
  if (fullName.length > 80) return { error: "That name is too long." };
  if (!isRole(role)) return { error: "Please choose a role." };

  const supabase = createAdminClient();

  let staffId = id;

  if (staffId) {
    const { error } = await supabase
      .from("staff")
      .update({ full_name: fullName, role })
      .eq("id", staffId);

    if (error) {
      console.error("[admin] could not update staff", error);
      return { error: "Could not save those changes. Please try again." };
    }
  } else {
    const { data, error } = await supabase
      .from("staff")
      .insert({ full_name: fullName, role, photo_path: null, photo_updated_at: null })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[admin] could not create staff", error);
      return { error: "Could not add that person. Please try again." };
    }

    staffId = data.id;
  }

  if (photo instanceof File && photo.size > 0) {
    const failure = await storePhoto(supabase, staffId, photo);
    if (failure) {
      // The row is already saved. Say so rather than implying nothing happened,
      // or the obvious next move is to add the person a second time.
      return { error: `${fullName} was saved, but the photo did not upload. ${failure}` };
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");

  return { notice: id ? `${fullName} updated.` : `${fullName} added.` };
}

/**
 * Archive or restore someone.
 *
 * Archiving is the normal way a person leaves. It hides them from every picker
 * and clears them from the current shift and everything rostered after it, but
 * leaves historical assignments intact — the record of who was on duty last
 * Tuesday is not something to erase because somebody has since resigned.
 */
export async function setStaffActiveAction(formData: FormData): Promise<StaffResult> {
  await requireAdmin();

  const staffId = clean(formData, "staff_id");
  const active = String(formData.get("active") ?? "") === "true";

  if (!staffId) return { error: "Nobody selected." };

  const supabase = createAdminClient();

  const { data: person } = await supabase
    .from("staff")
    .select("full_name")
    .eq("id", staffId)
    .maybeSingle();

  if (!person) return { error: "That person no longer exists." };

  const { error } = await supabase
    .from("staff")
    .update({ is_active: active })
    .eq("id", staffId);

  if (error) {
    console.error("[admin] could not change staff status", error);
    return { error: "Could not save that change. Please try again." };
  }

  let removed = 0;

  if (!active) {
    const { data: shift } = await supabase.rpc("current_shift", {});
    const current = shift?.[0];

    if (current) {
      // Everything from the current shift onwards. A shift on the same date but
      // earlier in the day (DAY when it is now NIGHT) is in the past and stays.
      const { data: cleared } = await supabase
        .from("shift_assignments")
        .delete()
        .eq("staff_id", staffId)
        .or(
          `shift_date.gt.${current.shift_date},and(shift_date.eq.${current.shift_date},shift.eq.${current.shift})`,
        )
        .select("id");

      removed = cleared?.length ?? 0;
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  revalidatePath("/admin/rota");

  if (active) return { notice: `${person.full_name} restored to the staff list.` };

  return {
    notice:
      removed > 0
        ? `${person.full_name} archived, and taken off ${removed} rostered ${removed === 1 ? "shift" : "shifts"}.`
        : `${person.full_name} archived.`,
  };
}

/**
 * Permanently delete someone, and their whole history with them.
 *
 * Offered separately from archiving, and gated behind typing CONFIRM, because
 * this is the destructive one: shift_assignments cascades, so the record of
 * every shift this person ever worked goes at the same time. Archiving is
 * almost always what is actually wanted; this exists for records created by
 * mistake.
 */
export async function deleteStaffAction(formData: FormData): Promise<StaffResult> {
  await requireAdmin();

  const staffId = clean(formData, "staff_id");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!staffId) return { error: "Nobody selected." };

  // Re-checked here, not just in the dialog: a server action is reachable by
  // anyone who can post to it, whatever the form did or did not require.
  if (confirmation !== "CONFIRM") {
    return { error: "Type CONFIRM exactly, in capitals, to delete this record." };
  }

  const supabase = createAdminClient();

  const { data: person } = await supabase
    .from("staff")
    .select("full_name, photo_path")
    .eq("id", staffId)
    .maybeSingle();

  if (!person) return { error: "That person no longer exists." };

  const { error } = await supabase.from("staff").delete().eq("id", staffId);

  if (error) {
    console.error("[admin] could not delete staff", error);
    return { error: "Could not delete that record. Please try again." };
  }

  if (person.photo_path) {
    // Best effort. A leftover object in a private bucket that nothing points at
    // is untidy, not a failure worth reporting over a completed deletion.
    await supabase.storage.from("staff-photos").remove([person.photo_path]);
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  revalidatePath("/admin/rota");

  return { notice: `${person.full_name} deleted.` };
}

// ---------------------------------------------------------------------------
// The swap PIN
// ---------------------------------------------------------------------------

/**
 * Set the 4-digit PIN staff type on the floor.
 *
 * Typed twice, because there is no "forgot PIN" path that does not involve
 * walking to a computer: get it wrong here and the tablets refuse every swap
 * until somebody comes back to this screen.
 */
export async function setPinAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const pin = String(formData.get("pin") ?? "").trim();
  const confirmation = String(formData.get("pin_confirm") ?? "").trim();

  if (!isValidPinShape(pin)) {
    return { error: "The PIN must be exactly four digits." };
  }

  if (pin !== confirmation) {
    return { error: "The two PINs did not match. Please type it again." };
  }

  // Not a hard block — a care home that wants 1234 on an internal board can have
  // it, and refusing outright just gets it written on the wall instead. But it
  // is worth one round of resistance.
  if (/^(\d)\1{3}$/.test(pin) && formData.get("accept_weak") !== "true") {
    return { error: "That PIN is four of the same digit. Submit again to use it anyway." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_swap_pin", { p_hash: await hashPin(pin) });

  if (error) {
    console.error("[admin] could not set the swap PIN", error);
    return { error: "Could not save the PIN. Please try again." };
  }

  revalidatePath("/admin/settings");

  return { notice: "PIN updated. It applies to every floor immediately." };
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------

export async function saveFloorAction(formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = clean(formData, "id");
  const name = clean(formData, "name");
  const slug = clean(formData, "slug")?.toLowerCase();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!name) return { error: "Please give the floor a name." };
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { error: "The web address must be lower-case letters, numbers and hyphens only." };
  }

  const supabase = await createClient();
  const values = {
    name,
    slug,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  };

  const { error } = id
    ? await supabase.from("floors").update(values).eq("id", id)
    : await supabase.from("floors").insert(values);

  if (error) {
    if (error.code === "23505") {
      return { error: `Another floor is already using the address "${slug}".` };
    }
    console.error("[admin] could not save floor", error);
    return { error: "Could not save that floor. Please try again." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");

  return { notice: `${name} saved.` };
}

/**
 * Delete a floor and every assignment ever made on it.
 *
 * Any tablet paired to this floor is stranded by this — its device cookie names
 * a floor that no longer exists, and it will land on the setup screen until
 * somebody re-pairs it. The confirmation says so, because the alternative is
 * discovering it from a tablet on a wall.
 */
export async function deleteFloorAction(formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = clean(formData, "id");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!id) return { error: "No floor selected." };
  if (confirmation !== "CONFIRM") {
    return { error: "Type CONFIRM exactly, in capitals, to delete this floor." };
  }

  const supabase = await createClient();
  const { data: floor } = await supabase
    .from("floors")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (!floor) return { error: "That floor no longer exists." };

  const { error } = await supabase.from("floors").delete().eq("id", id);

  if (error) {
    console.error("[admin] could not delete floor", error);
    return { error: "Could not delete that floor. Please try again." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");

  return { notice: `${floor.name} deleted. Any tablet paired to it needs setting up again.` };
}

// ---------------------------------------------------------------------------
// The rota
// ---------------------------------------------------------------------------

export interface RotaResult {
  error?: string;
}

/**
 * Fill or clear one slot on a named shift.
 *
 * This is the mechanism behind "have it change automatically at handover":
 * there is no scheduled job and nothing to trigger. The board renders whichever
 * shift the database says it currently is, so a night shift filled in here on
 * Monday afternoon simply appears on the wall at 20:00.
 */
export async function setRotaSlotAction(formData: FormData): Promise<RotaResult> {
  await requireAdmin();

  const floorSlug = clean(formData, "floor");
  const shiftDate = clean(formData, "shift_date");
  const shift = String(formData.get("shift") ?? "");
  const role = String(formData.get("role") ?? "");
  const slotIndex = Number(formData.get("slot_index"));
  const staffId = clean(formData, "staff_id");

  if (!floorSlug) return { error: "No floor selected." };
  if (!shiftDate || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) return { error: "Invalid date." };
  if (!isShift(shift)) return { error: "Invalid shift." };
  if (!isRole(role)) return { error: "Invalid role." };
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= ROLE_SPECS[role as Role].capacity
  ) {
    return { error: "Invalid slot." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_slot_at", {
    p_floor_slug: floorSlug,
    p_shift_date: shiftDate,
    p_shift: shift as Shift,
    p_role: role as Role,
    p_slot_index: slotIndex,
    p_staff_id: staffId,
  });

  if (error) {
    console.error("[admin] set_slot_at failed", error);
    return { error: "Could not save that change. Please try again." };
  }

  const result = data as { outcome?: string } | null;

  if (result?.outcome === "NO_SUCH_STAFF") {
    return { error: "That person is no longer on the staff list." };
  }

  if (result?.outcome !== "SET" && result?.outcome !== "CLEARED") {
    return { error: "Could not save that change." };
  }

  revalidatePath("/admin/rota");
  revalidatePath("/admin");

  return {};
}

/**
 * Copy the team from the shift before this one.
 *
 * The single most useful thing on the rota screen. Most shifts are close to the
 * one before them, so filling nine slots by hand every time is exactly the kind
 * of chore that ends with the rota not being kept up at all. Copy, then change
 * the two people who are different.
 *
 * Skips anyone since archived, and does not overwrite slots already filled.
 */
export async function copyPreviousShiftAction(formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const floorSlug = clean(formData, "floor");
  const shiftDate = clean(formData, "shift_date");
  const shift = String(formData.get("shift") ?? "");

  if (!floorSlug || !shiftDate || !isShift(shift)) {
    return { error: "Nothing selected." };
  }

  // The shift before a DAY is the previous night, which is dated the day before.
  const previous =
    shift === "DAY"
      ? { date: addDays(shiftDate, -1), shift: "NIGHT" as Shift }
      : { date: shiftDate, shift: "DAY" as Shift };

  const supabase = await createClient();

  const [{ data: source, error: sourceError }, { data: existing }] = await Promise.all([
    supabase.rpc("rota_for", {
      p_floor_slug: floorSlug,
      p_shift_date: previous.date,
      p_shift: previous.shift,
    }),
    supabase.rpc("rota_for", {
      p_floor_slug: floorSlug,
      p_shift_date: shiftDate,
      p_shift: shift as Shift,
    }),
  ]);

  if (sourceError) {
    console.error("[admin] could not read the previous shift", sourceError);
    return { error: "Could not read the previous shift. Please try again." };
  }

  if (!source || source.length === 0) {
    return { error: "The previous shift is empty, so there is nothing to copy." };
  }

  const taken = new Set((existing ?? []).map((slot) => `${slot.role}:${slot.slot_index}`));
  let copied = 0;
  let skipped = 0;

  for (const slot of source) {
    if (taken.has(`${slot.role}:${slot.slot_index}`)) continue;

    if (!slot.is_active) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.rpc("set_slot_at", {
      p_floor_slug: floorSlug,
      p_shift_date: shiftDate,
      p_shift: shift as Shift,
      p_role: slot.role,
      p_slot_index: slot.slot_index,
      p_staff_id: slot.staff_id,
    });

    if (!error) copied += 1;
  }

  revalidatePath("/admin/rota");
  revalidatePath("/admin");

  if (copied === 0) {
    return { error: "Nothing to copy — every slot is already filled." };
  }

  return {
    notice:
      skipped > 0
        ? `Copied ${copied} from the previous shift. ${skipped} skipped — no longer on the staff list.`
        : `Copied ${copied} from the previous shift.`,
  };
}

/** Shift a plain YYYY-MM-DD by whole days, without touching local time. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
