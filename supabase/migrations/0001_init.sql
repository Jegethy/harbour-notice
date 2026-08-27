-- ============================================================================
-- Harbour Care Centre — On-Duty Noticeboard
-- 0001_init.sql — floors, staff, the rota, RLS, board RPCs
--
-- Run via `supabase db push`, or paste into the Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'staff_role' and n.nspname = 'public') then
    create type public.staff_role as enum ('NURSE', 'SENIOR_CARER', 'CARE_ASSISTANT');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'shift_name' and n.nspname = 'public') then
    create type public.shift_name as enum ('DAY', 'NIGHT');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- role_capacity — how many slots each section of the board holds.
--
-- A function rather than a lookup table because these numbers are a property of
-- the board's layout, not data staff maintain: the display is designed around
-- one nurse, three seniors and five assistants. Changing a number here is a
-- deliberate schema change, and the CHECK constraint below picks it up
-- immediately. IMMUTABLE so it can be used in that constraint at all.
-- ----------------------------------------------------------------------------
create or replace function public.role_capacity(p_role public.staff_role)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case p_role
    when 'NURSE'          then 1
    when 'SENIOR_CARER'   then 3
    when 'CARE_ASSISTANT' then 5
  end)::smallint;
$$;


-- ----------------------------------------------------------------------------
-- current_shift — the single source of truth for "which shift is it now".
--
-- Handover is 08:00 and 20:00 *local* time, so this works in Europe/London and
-- stays correct across the BST/GMT changeover. Postgres stores timestamptz in
-- UTC; comparing UTC clock time would put handover an hour out for half the
-- year, which is exactly the hour the board matters most.
--
-- A night shift is dated by the day it STARTS, which is how staff talk about
-- it: someone working 20:00 Tuesday to 08:00 Wednesday is "on nights Tuesday".
-- So at 03:00 on Wednesday the current shift is (Tuesday, NIGHT).
--
-- The application deliberately does NOT reimplement this. The board route asks
-- the database. The browser only computes when the *next* handover falls, as a
-- hint for when to re-poll — if that hint drifts, the poll still corrects it.
-- ----------------------------------------------------------------------------
create or replace function public.current_shift(p_at timestamptz default now())
returns table (shift_date date, shift public.shift_name)
language sql
stable
set search_path = ''
as $$
  with london as (select (p_at at time zone 'Europe/London') as ts)
  select
    case when ts::time >= time '08:00' then ts::date else ts::date - 1 end,
    case when ts::time >= time '08:00' and ts::time < time '20:00'
         then 'DAY'::public.shift_name
         else 'NIGHT'::public.shift_name
    end
  from london;
$$;


-- ----------------------------------------------------------------------------
-- floors — one tablet, one board, one floor.
-- ----------------------------------------------------------------------------
create table if not exists public.floors (
  id         uuid primary key default gen_random_uuid(),
  /** URL segment for this floor's board, e.g. "ground" -> /board/ground. */
  slug       text not null unique,
  name       text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint floors_slug_shape  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  constraint floors_name_filled check (length(btrim(name)) > 0 and length(name) <= 60)
);


-- ----------------------------------------------------------------------------
-- staff — the people whose photographs go on the board.
--
-- `role` is the person's usual role and drives which section of the swap modal
-- lists them first. It does NOT constrain which slot they can fill: a senior
-- carer covering an assistant shift is ordinary, and a board that refused to
-- record what actually happened would just be worked around.
--
-- is_active is the normal way someone leaves. Archiving hides them from every
-- picker and every future shift while keeping the historical rota readable,
-- which a hard delete would erase.
-- ----------------------------------------------------------------------------
create table if not exists public.staff (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  role             public.staff_role not null,
  /** Object key inside the private `staff-photos` bucket. NULL = show initials. */
  photo_path       text,
  /** Bumped on every photo replacement; used to bust the browser's image cache. */
  photo_updated_at timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),

  constraint staff_full_name_filled
    check (length(btrim(full_name)) > 0 and length(full_name) <= 80)
);

create index if not exists staff_pickers_idx
  on public.staff (role, full_name)
  where is_active;


-- ----------------------------------------------------------------------------
-- shift_assignments — the rota, and therefore also the live board.
--
-- There is no separate "what is on the board right now" table. The board shows
-- the assignments for whatever current_shift() says it is, and that is what
-- makes the 08:00/20:00 handover automatic: nothing runs, nothing is scheduled,
-- the query key simply changes and the next poll returns the other shift's
-- people. Pre-fill tomorrow night in the admin rota and it appears by itself.
--
-- A row exists only for a slot that is filled. An empty slot is an absent row,
-- not a row with a NULL staff_id — the board is nearly always short against its
-- five-assistant capacity, and rows-for-nobody would mean every read had to
-- filter them out and every count had to discount them.
-- ----------------------------------------------------------------------------
create table if not exists public.shift_assignments (
  id         uuid primary key default gen_random_uuid(),
  floor_id   uuid not null references public.floors(id) on delete cascade,
  shift_date date not null,
  shift      public.shift_name not null,
  role       public.staff_role not null,
  slot_index smallint not null,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shift_assignments_slot_within_capacity
    check (slot_index >= 0 and slot_index < public.role_capacity(role))
);

-- One person per slot.
create unique index if not exists shift_assignments_one_per_slot
  on public.shift_assignments (floor_id, shift_date, shift, role, slot_index);

-- Nobody stands in two places on the same floor for the same shift. Being on
-- two *different* floors is allowed on purpose — a nurse covering the whole
-- building is normal — but the swap modal flags it so it is never accidental.
create unique index if not exists shift_assignments_one_slot_per_person_per_floor
  on public.shift_assignments (floor_id, shift_date, shift, staff_id);

-- The board read: everything for one floor, one shift.
create index if not exists shift_assignments_board_idx
  on public.shift_assignments (floor_id, shift_date, shift);

-- "Where else is this person on tonight?" for the double-booking flag.
create index if not exists shift_assignments_person_shift_idx
  on public.shift_assignments (shift_date, shift, staff_id);


-- ----------------------------------------------------------------------------
-- app_settings — one row, enforced by the primary key.
--
-- Holds the 4-digit swap PIN as a salted scrypt hash. Four digits is only
-- 10,000 possibilities, so the hash is not what makes this safe; the rate limit
-- on the unlock endpoint is. The hash is here so that a database dump does not
-- hand over the PIN staff are typing in the corridor, and so that no plaintext
-- PIN exists anywhere.
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                  boolean primary key default true,
  swap_pin_hash       text not null,
  swap_pin_updated_at timestamptz not null default now(),

  constraint app_settings_single_row check (id)
);

comment on table public.app_settings is
  'Exactly one row. The CHECK on the primary key makes a second row impossible.';


-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Posture, inherited from the visitor kiosk: a tablet mounted in a corridor is
-- physically reachable by residents, families and contractors, so it gets no
-- database credentials at all. Every board read and every handover swap goes
-- through a Next.js route holding the service-role key, behind a device cookie.
--
-- The anon key can read nothing. Staff photographs and a list of who is in the
-- building tonight are exactly what should not be one URL away.
--
-- Authenticated = signed-in admin = full access, for the admin panel.
-- ----------------------------------------------------------------------------
alter table public.floors            enable row level security;
alter table public.staff             enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.app_settings      enable row level security;

drop policy if exists admin_all_floors on public.floors;
create policy admin_all_floors on public.floors
  for all to authenticated using (true) with check (true);

drop policy if exists admin_all_staff on public.staff;
create policy admin_all_staff on public.staff
  for all to authenticated using (true) with check (true);

drop policy if exists admin_all_shift_assignments on public.shift_assignments;
create policy admin_all_shift_assignments on public.shift_assignments
  for all to authenticated using (true) with check (true);

-- app_settings deliberately has NO policy. The PIN hash is never read or
-- written directly by the app: the admin panel replaces it through
-- set_swap_pin(), and the unlock route compares through swap_pin_hash(), both
-- SECURITY DEFINER. RLS with no policy denies everything, which is the point.

revoke all on public.floors, public.staff, public.shift_assignments, public.app_settings from anon;


-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shift_assignments_touch on public.shift_assignments;
create trigger shift_assignments_touch
  before update on public.shift_assignments
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- board_snapshot(floor_slug) — everything one tablet needs, in one round trip.
--
-- Returns the floor, the shift the database believes it is, and the filled
-- slots. Shaped as jsonb rather than a row set because the tablet polls this
-- and compares an ETag: one JSON document hashes cleanly, where a row set has
-- to be reassembled and re-serialised before it can be compared.
--
-- `at` is included so the board can show a clock that agrees with the shift it
-- is displaying, rather than the tablet's own clock, which nobody has checked
-- since it was unboxed.
-- ----------------------------------------------------------------------------
create or replace function public.board_snapshot(p_floor_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_floor public.floors%rowtype;
  v_date  date;
  v_shift public.shift_name;
  v_slots jsonb;
begin
  select * into v_floor from public.floors where slug = p_floor_slug;
  if not found then
    return jsonb_build_object('outcome', 'NO_SUCH_FLOOR');
  end if;

  select cs.shift_date, cs.shift into v_date, v_shift from public.current_shift() cs;

  select coalesce(
           jsonb_agg(entry order by entry->>'role', (entry->>'slot_index')::int),
           '[]'::jsonb
         )
  into v_slots
  from (
    select jsonb_build_object(
             'role',             a.role,
             'slot_index',       a.slot_index,
             'staff_id',         s.id,
             'full_name',        s.full_name,
             'photo_updated_at', s.photo_updated_at,
             'has_photo',        s.photo_path is not null
           ) as entry
    from public.shift_assignments a
    join public.staff s on s.id = a.staff_id
    where a.floor_id = v_floor.id and a.shift_date = v_date and a.shift = v_shift
  ) filled;

  return jsonb_build_object(
    'outcome',    'OK',
    'floor',      jsonb_build_object('slug', v_floor.slug, 'name', v_floor.name),
    'shift_date', v_date,
    'shift',      v_shift,
    'at',         now(),
    'slots',      v_slots
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- available_staff(role, floor_slug) — the swap modal's list.
--
-- Returns everyone still employed, the person's usual role first, each row
-- carrying where they already are this shift. `on_this_floor` greys out someone
-- already on this board; `on_other_floor` names the other board, so staff can
-- see they are about to put a nurse on two floors and decide to on purpose.
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
  matches_role     boolean,
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
    s.role = p_role,
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
  order by (s.role = p_role) desc, s.full_name;
$$;


-- ----------------------------------------------------------------------------
-- set_slot_at(...) — put someone in a slot, on a named shift.
--
-- One call for the whole operation: a NULL staff_id clears the slot, anything
-- else fills or replaces it.
--
-- Someone already in another slot on this floor is MOVED rather than
-- duplicated. Without that, swapping two people round — which is most of what
-- happens at handover — would hit the unique index and fail with a message
-- about a constraint, on a screen with no keyboard and nobody technical nearby.
--
-- The corridor tablets never call this directly; they call set_slot() below,
-- which pins the shift to now. This one exists for the admin rota, which is
-- specifically the tool for writing to a shift that has not started yet.
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
  v_floor_id uuid;
  v_name     text;
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

  select full_name into v_name from public.staff where id = p_staff_id and is_active;
  if not found then
    return jsonb_build_object('outcome', 'NO_SUCH_STAFF');
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
-- set_slot(floor_slug, role, slot_index, staff_id) — the handover tap.
--
-- Deliberately takes no date or shift. The tablet has no say in which shift it
-- is writing to: the database decides, from its own clock, every time. A wall
-- tablet whose clock has drifted an hour — and they do — must not be able to
-- write tonight's handover into this afternoon.
-- ----------------------------------------------------------------------------
create or replace function public.set_slot(
  p_floor_slug text,
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
  v_date  date;
  v_shift public.shift_name;
begin
  select cs.shift_date, cs.shift into v_date, v_shift from public.current_shift() cs;
  return public.set_slot_at(p_floor_slug, v_date, v_shift, p_role, p_slot_index, p_staff_id);
end;
$$;


-- ----------------------------------------------------------------------------
-- rota_for(floor_slug, shift_date, shift) — one shift, for the admin planner.
--
-- Returns the filled slots only, same shape as board_snapshot's `slots`, so the
-- planner and the board agree on what a slot looks like.
-- ----------------------------------------------------------------------------
create or replace function public.rota_for(
  p_floor_slug text,
  p_shift_date date,
  p_shift      public.shift_name
)
returns table (
  role             public.staff_role,
  slot_index       smallint,
  staff_id         uuid,
  full_name        text,
  has_photo        boolean,
  photo_updated_at timestamptz,
  is_active        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.role, a.slot_index, s.id, s.full_name,
         s.photo_path is not null, s.photo_updated_at, s.is_active
  from public.shift_assignments a
  join public.floors f on f.id = a.floor_id
  join public.staff  s on s.id = a.staff_id
  where f.slug = p_floor_slug and a.shift_date = p_shift_date and a.shift = p_shift
  order by a.role, a.slot_index;
$$;


-- ----------------------------------------------------------------------------
-- swap_pin_hash() / set_swap_pin(hash)
--
-- The stored hash is reachable only through these two SECURITY DEFINER
-- functions, so no route ever has a reason to SELECT app_settings and the
-- comparison happens in one place.
--
-- Salt and derivation live in the application (node:crypto scrypt); Postgres
-- only stores and returns the resulting string.
-- ----------------------------------------------------------------------------
create or replace function public.swap_pin_hash()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select swap_pin_hash from public.app_settings where id;
$$;

/**
 * When the PIN was last changed — and nothing else.
 *
 * The settings screen wants to say "last changed 3 June" without any route ever
 * being able to read the hash itself. Two narrow functions rather than one that
 * returns the row.
 */
create or replace function public.swap_pin_status()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select swap_pin_updated_at from public.app_settings where id;
$$;

create or replace function public.set_swap_pin(p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_settings (id, swap_pin_hash, swap_pin_updated_at)
  values (true, p_hash, now())
  on conflict (id) do update
    set swap_pin_hash       = excluded.swap_pin_hash,
        swap_pin_updated_at = now();
end;
$$;


-- ----------------------------------------------------------------------------
-- Function grants
--
-- Board functions are called server-side with the service-role key only. The
-- admin panel calls set_swap_pin as a signed-in user.
-- ----------------------------------------------------------------------------
revoke all on function public.board_snapshot(text)                              from public, anon, authenticated;
revoke all on function public.available_staff(public.staff_role, text)          from public, anon, authenticated;
revoke all on function public.set_slot(text, public.staff_role, smallint, uuid) from public, anon, authenticated;
revoke all on function public.swap_pin_hash()                                   from public, anon, authenticated;
revoke all on function public.set_swap_pin(text)                                from public, anon;
revoke all on function public.swap_pin_status()                                 from public, anon;
revoke all on function public.current_shift(timestamptz)                        from public, anon;
revoke all on function public.rota_for(text, date, public.shift_name)           from public, anon;
revoke all on function public.set_slot_at(text, date, public.shift_name, public.staff_role, smallint, uuid)
  from public, anon;

grant execute on function public.board_snapshot(text)                              to service_role;
grant execute on function public.available_staff(public.staff_role, text)          to service_role;
grant execute on function public.set_slot(text, public.staff_role, smallint, uuid) to service_role;
grant execute on function public.swap_pin_hash()                                   to service_role;
grant execute on function public.set_swap_pin(text)                                to authenticated, service_role;
grant execute on function public.swap_pin_status()                                 to authenticated, service_role;
grant execute on function public.current_shift(timestamptz)                        to authenticated, service_role;
grant execute on function public.rota_for(text, date, public.shift_name)           to authenticated, service_role;
grant execute on function public.set_slot_at(text, date, public.shift_name, public.staff_role, smallint, uuid)
  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- Realtime — the admin panel's "on duty now" overview.
--
-- The corridor tablets deliberately do NOT use this: subscribing from the
-- browser would mean granting the anon key SELECT on staff and
-- shift_assignments, which is the whole staff list and every photograph, one
-- URL away. Tablets poll a device-gated route instead. A signed-in admin is a
-- different matter, so their overview is live.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'shift_assignments') then
    alter publication supabase_realtime add table public.shift_assignments;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- Seed — three floors, so a fresh install has something to pair a tablet to.
-- Rename them in the admin panel; the slugs are what the tablets bookmark.
-- ----------------------------------------------------------------------------
insert into public.floors (slug, name, sort_order) values
  ('ground', 'Ground Floor', 0),
  ('first',  'First Floor',  1),
  ('second', 'Second Floor', 2)
on conflict (slug) do nothing;
