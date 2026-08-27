-- ============================================================================
-- 0003_role_restriction.sql — a slot can only hold somebody who holds that role
--
-- Supersedes a decision made in 0001_init.sql. That version let any active
-- member of staff fill any slot, on the reasoning that a senior carer covering
-- an assistant shift is ordinary and a board which refused to record what
-- actually happened would be worked around.
--
-- That reasoning does not survive contact with the domain. "Nurse in Charge" is
-- not a label on a board, it is a registered nurse carrying clinical and legal
-- responsibility for the floor, and a board asserting that a care assistant
-- holds it is stating something untrue to families, to visiting professionals
-- and to an inspector. The same applies downwards: the board is a statement of
-- who is accountable for what, not a seating plan.
--
-- So the rule is now the plain one: a slot holds somebody whose role is that
-- role. Enforced in set_slot_at() rather than in the UI, so it holds for the
-- tablets, the admin rota, and anything posting directly to the API.
--
-- Deliberately NOT a table CHECK constraint: rows written before this migration
-- may already violate it, and a constraint would make this migration fail on
-- exactly the installations that need it most. Existing mismatches survive, stay
-- visible, and are flagged for correction in the admin rota.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- set_slot_at — now refuses a role mismatch.
--
-- Returns {"outcome":"WRONG_ROLE", ...} with both roles named, so the caller can
-- say which person and which position rather than "that did not work".
-- ----------------------------------------------------------------------------
create or replace function public.set_slot_at(
  p_floor_slug text,
  p_shift_date date,
  p_shift      public.shift_name,
  p_role       public.staff_role,
  p_slot_index smallint,
  p_staff_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_floor_id   uuid;
  v_name       text;
  v_staff_role public.staff_role;
begin
  select id into v_floor_id from public.floors where slug = p_floor_slug;
  if not found then
    return jsonb_build_object('outcome', 'NO_SUCH_FLOOR');
  end if;

  if p_slot_index < 0 or p_slot_index >= public.role_capacity(p_role) then
    return jsonb_build_object('outcome', 'BAD_SLOT');
  end if;

  if p_staff_id is null then
    delete from public.shift_assignments
    where floor_id = v_floor_id and shift_date = p_shift_date and shift = p_shift
      and role = p_role and slot_index = p_slot_index;

    return jsonb_build_object('outcome', 'CLEARED');
  end if;

  select full_name, role into v_name, v_staff_role
  from public.staff
  where id = p_staff_id and is_active;

  if not found then
    return jsonb_build_object('outcome', 'NO_SUCH_STAFF');
  end if;

  -- The rule this migration exists for.
  if v_staff_role <> p_role then
    return jsonb_build_object(
      'outcome',    'WRONG_ROLE',
      'full_name',  v_name,
      'staff_role', v_staff_role,
      'slot_role',  p_role
    );
  end if;

  -- Take them out of any other slot on this floor first, so "put Amara in slot
  -- 2" reads as a move rather than failing on the uniqueness index.
  delete from public.shift_assignments
  where floor_id = v_floor_id and shift_date = p_shift_date and shift = p_shift
    and staff_id = p_staff_id
    and not (role = p_role and slot_index = p_slot_index);

  insert into public.shift_assignments (floor_id, shift_date, shift, role, slot_index, staff_id)
  values (v_floor_id, p_shift_date, p_shift, p_role, p_slot_index, p_staff_id)
  on conflict (floor_id, shift_date, shift, role, slot_index)
  do update set staff_id = excluded.staff_id;

  return jsonb_build_object('outcome', 'SET', 'full_name', v_name);
end;
$$;


-- ----------------------------------------------------------------------------
-- available_staff — now returns only people who hold the role.
--
-- Dropped and recreated rather than replaced: the return signature loses
-- `matches_role`, which existed only to sort a mixed list into "these first,
-- everyone else after". With the list no longer mixed there is nothing for it
-- to say.
--
-- Filtering here rather than in the modal also means a tablet is only ever sent
-- the handful of people eligible for the slot being edited, instead of the
-- entire staff roll with photographs.
-- ----------------------------------------------------------------------------
drop function if exists public.available_staff(public.staff_role, text);

create or replace function public.available_staff(
  p_role       public.staff_role,
  p_floor_slug text
)
returns table (
  staff_id         uuid,
  full_name        text,
  role             public.staff_role,
  has_photo        boolean,
  photo_updated_at timestamptz,
  on_this_floor    boolean,
  on_other_floor   text
)
language sql
stable
security definer
set search_path = ''
as $$
  with now_shift as (select cs.shift_date, cs.shift from public.current_shift() cs),
       this_floor as (select f.id from public.floors f where f.slug = p_floor_slug)
  select
    s.id,
    s.full_name,
    s.role,
    s.photo_path is not null,
    s.photo_updated_at,
    exists (
      select 1
      from public.shift_assignments a, now_shift sh, this_floor t
      where a.staff_id = s.id and a.floor_id = t.id
        and a.shift_date = sh.shift_date and a.shift = sh.shift
    ),
    (
      select string_agg(f.name, ', ' order by f.sort_order)
      from public.shift_assignments a
      join public.floors f on f.id = a.floor_id
      cross join now_shift sh
      cross join this_floor t
      where a.staff_id = s.id and a.floor_id <> t.id
        and a.shift_date = sh.shift_date and a.shift = sh.shift
    )
  from public.staff s
  where s.is_active and s.role = p_role
  order by s.full_name;
$$;

revoke all on function public.available_staff(public.staff_role, text) from public, anon, authenticated;
grant execute on function public.available_staff(public.staff_role, text) to service_role;


-- ----------------------------------------------------------------------------
-- Find assignments that break the new rule.
--
-- Nothing is rewritten automatically — who was on duty last Tuesday is a record,
-- not a mistake to tidy up, and guessing a replacement for a future shift would
-- be worse than leaving it visible. Run this to see what needs correcting:
--
--   select * from public.mismatched_assignments;
--
-- The admin rota flags these in place; current and future shifts are the ones
-- worth acting on.
-- ----------------------------------------------------------------------------
create or replace view public.mismatched_assignments
with (security_invoker = true) as
select
  f.name  as floor_name,
  a.shift_date,
  a.shift,
  a.role  as slot_role,
  a.slot_index,
  s.full_name,
  s.role  as staff_role,
  (a.shift_date, a.shift) >= (select cs.shift_date, cs.shift from public.current_shift() cs)
          as is_current_or_future
from public.shift_assignments a
join public.floors f on f.id = a.floor_id
join public.staff  s on s.id = a.staff_id
where s.role <> a.role
order by a.shift_date desc, f.sort_order;

grant select on public.mismatched_assignments to authenticated;
revoke all on public.mismatched_assignments from anon;
