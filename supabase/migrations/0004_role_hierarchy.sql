-- ============================================================================
-- 0004_role_hierarchy.sql — cover flows downward, never upward
--
-- Refines 0003_role_restriction.sql. That migration required an exact match
-- between a person's role and the slot's, which was too strict: a senior carer
-- covering a care assistant shift and a nurse covering a senior carer shift are
-- both ordinary. What must never happen is the reverse — a senior carer standing
-- in the Nurse in Charge slot, which would assert clinical accountability that
-- the person does not hold.
--
-- So the rule is a rank, not an equality: you may fill a slot at or below your
-- own. Nurse (3) > Senior Carer (2) > Care Assistant (1).
--
-- This is why 0003 was written as a function check rather than a CHECK
-- constraint — refining the rule is a function replacement, and rows recorded
-- under the older, stricter reading stay valid under this looser one.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- role_rank — seniority as a number, so "at or below" is a comparison.
--
-- Deliberately separate from role_capacity(): one is how many slots the board
-- draws, the other is who is allowed to stand in them. They happen to be
-- ordered the same way today and that is a coincidence, not a relationship.
-- ----------------------------------------------------------------------------
create or replace function public.role_rank(p_role public.staff_role)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case p_role
    when 'NURSE'          then 3
    when 'SENIOR_CARER'   then 2
    when 'CARE_ASSISTANT' then 1
  end)::smallint;
$$;

revoke all on function public.role_rank(public.staff_role) from public, anon;
grant execute on function public.role_rank(public.staff_role) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- set_slot_at — refuses only upward cover now.
--
-- WRONG_ROLE still names both roles, so the caller can say "Clara Hughes is a
-- senior carer, and this is the Nurse in Charge position" rather than refusing
-- without explaining.
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

  -- Cover downward is fine. Cover upward is the thing this refuses.
  if public.role_rank(v_staff_role) < public.role_rank(p_role) then
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
-- available_staff — everyone at or above the slot's rank.
--
-- Ordered so the people whose own role this is come first and anyone covering
-- from above follows. At handover the usual answer is near the top, and the
-- cover options are visible underneath rather than hidden behind a control.
-- ----------------------------------------------------------------------------
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
  where s.is_active
    and public.role_rank(s.role) >= public.role_rank(p_role)
  order by (s.role = p_role) desc, public.role_rank(s.role), s.full_name;
$$;

revoke all on function public.available_staff(public.staff_role, text) from public, anon, authenticated;
grant execute on function public.available_staff(public.staff_role, text) to service_role;


-- ----------------------------------------------------------------------------
-- mismatched_assignments — now only flags upward cover.
--
-- Rows that 0003 would have flagged as mismatched because a senior carer was in
-- a care assistant slot are legitimate under this rule and drop out of the view.
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
where public.role_rank(s.role) < public.role_rank(a.role)
order by a.shift_date desc, f.sort_order;

grant select on public.mismatched_assignments to authenticated;
revoke all on public.mismatched_assignments from anon;
