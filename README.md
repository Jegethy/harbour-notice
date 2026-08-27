# Harbour Care Centre — On-Duty Noticeboard

A wall-mounted digital noticeboard showing who is on duty on each floor: the
Nurse in Charge, the Senior Carers and the Care Assistants, with photographs.
Staff change it themselves at handover behind a 4-digit PIN. An administrator
manages the staff list and can plan the rota in advance.

Replaces a corkboard with Velcro'd photographs. Same stack as the visitor
check-in kiosk (`harbour-kiosk`), so the two screens in the building look and
behave like one system.

## What it does

**On the wall** — `/board/<floor>` on a tablet in portrait, in kiosk mode.
Photographs and names in three bands, largest at the top. The board shows only
the people who are actually on: a floor running one nurse and two assistants
gets three large photographs filling the screen, not three small ones above a
row of empty boxes. It never scrolls.

At 08:00 and 20:00 it changes to the other shift by itself, and the whole screen
shifts from maroon to indigo so a stale board is obvious from the end of the
corridor.

**At handover** — tap any photograph, enter the PIN, and the board unlocks for
ten minutes. Swap people in and out, add someone to an empty slot, or take
someone off entirely. A countdown and a **Done** button are on screen. One PIN
entry covers a whole handover, because six PIN entries in a row is how a PIN
ends up written on the wall beside the tablet.

**In the office** — `/admin`, behind a Supabase login.

| Screen | What it is for |
| --- | --- |
| On duty now | Every floor, live. Read-only — flags a floor with no nurse recorded. |
| Staff | Add, edit, photograph, archive, delete. |
| Rota | Fill a shift in ahead of time; it appears on the wall by itself at handover. |
| Settings | The swap PIN, the floors, and how to pair a tablet. |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase
(Postgres, Auth, Storage) · TypeScript.

## Project structure

```
harbour-notice/
├── supabase/migrations/
│   ├── 0001_init.sql            Schema, RLS, and every RPC. Read this first —
│   │                            the design decisions are documented in it.
│   └── 0002_storage.sql         The private staff-photos bucket.
├── scripts/hash-pin.ts          Set the very first PIN without a browser.
└── src/
    ├── proxy.ts                 Session refresh + /admin redirects (Next 16
    │                            renamed `middleware` to `proxy`).
    ├── app/
    │   ├── (board)/             Everything a tablet sees. Route group, so the
    │   │   ├── page.tsx           URLs stay short.
    │   │   ├── setup/             Pair this tablet to a floor.
    │   │   └── board/[floor]/     The wall display.
    │   ├── admin/
    │   │   ├── actions.ts       All server actions, all calling requireAdmin().
    │   │   ├── login/
    │   │   └── (dashboard)/     Overview, staff, rota, settings.
    │   └── api/
    │       ├── board/[floor]/   Snapshot (polled), staff list, slot, unlock.
    │       ├── board/pair/      Exchange the setup code for a device cookie.
    │       └── photo/[staffId]/ Streams from the private bucket.
    ├── components/
    │   ├── board/               BoardClient, BoardSection, StaffCard, PinPad,
    │   │                        SwapModal, BoardHeader.
    │   └── admin/               StaffTable, StaffDialog, PhotoField, RotaPlanner,
    │                            PinForm, FloorsPanel, DutyRefresher, LoginForm.
    ├── hooks/                   useBoardPoll (the wall display's update loop).
    └── lib/
        ├── auth.ts              requireAdmin() — the authorisation boundary.
        ├── board/
        │   ├── device.ts        Tablet pairing: signed cookie naming one floor.
        │   ├── unlock.ts        PIN hashing + the ten-minute editing window.
        │   ├── guard.ts         The checks every board route runs.
        │   ├── roles.ts         Section capacities and layout. Client-safe.
        │   ├── shift.ts         Shift labels and handover timing. Display only.
        │   ├── rate-limit.ts    In-memory attempt limiting.
        │   └── photo.ts         Stable, versioned photo URLs.
        ├── supabase/            client / server / admin (service-role) / session.
        └── types/database.ts    Hand-maintained mirror of the migrations.
```

## Data model

Four tables. The full reasoning is in `supabase/migrations/0001_init.sql`.

- **`floors`** — one tablet, one board, one floor. `slug` is the URL.
- **`staff`** — name, usual role, photo, `is_active`. The role decides which
  section lists them first; it does not stop a senior carer covering an
  assistant shift.
- **`shift_assignments`** — `(floor, shift_date, shift, role, slot_index) →
  staff`. This is both the rota and the live board.
- **`app_settings`** — one row, holding the scrypt hash of the swap PIN.

### The one idea worth knowing

**There is no "current board" table, and nothing runs at 08:00 or 20:00.**

The board renders the assignments for whatever `current_shift()` says it is.
Handover is automatic because the query key changes — night rows filled in on
Monday afternoon simply *are* what the wall shows when 20:00 arrives. A shift
left blank is one the floor fills in on the tablet. Both routes write the same
rows, so the rota and the live board can never disagree.

`current_shift()` works in Europe/London, so handover stays at 08:00 and 20:00
local across the BST/GMT change. A night shift is dated by the day it *starts*,
the way staff talk about it. The application never reimplements this — it asks
the database.

## Security posture

Inherited from the visitor kiosk: **a tablet on a corridor wall gets no database
credentials.** It holds an httpOnly cookie naming one floor; every read and
write goes through a Next.js route using the service-role key. The anon key can
read nothing — RLS denies it, and staff photographs plus tonight's rota are
exactly what should not be one URL away.

Two consequences worth knowing before changing anything:

- **The boards poll; they do not use Realtime.** A browser subscription
  authenticates with the anon key, which would mean granting `anon` SELECT on
  `staff` and `shift_assignments` — the whole staff list and every photograph.
  No RLS policy fixes that, because the rows the board needs *are* the sensitive
  rows. The admin overview is behind a login, so that one does use Realtime.
  Polling sends an `If-None-Match`, so the usual answer is a 304 with no body.
- **The PIN is protected by the rate limit, not the hash.** Four digits is
  10,000 possibilities. `/api/board/[floor]/unlock` allows eight attempts per
  quarter hour and clears the count on success. The hash exists so a database
  dump does not hand over the number staff type on the wall.

## Getting started

1. **Create a Supabase project**, then run both migrations in filename order —
   `supabase db push`, or paste each into the SQL Editor. Both are idempotent.

2. **Copy the environment file** and fill it in:

   ```bash
   cp .env.local.example .env.local
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

   That value goes in `BOARD_SETUP_TOKEN`. The Supabase URL, anon key and
   service-role key come from Project Settings → API.

3. **Install and run:**

   ```bash
   npm install
   npm run dev
   ```

4. **Create your admin account** in the Supabase dashboard (Authentication →
   Users → Invite), and **turn off public signups** under Authentication →
   Providers. Otherwise anyone reaching `/admin` can make themselves an account.

5. **Set the swap PIN** at `/admin/settings`. Until one is set the tablets refuse
   every swap — deliberately, so a board is never briefly unprotected. If you
   need to set it without a browser:

   ```bash
   npm run hash:pin -- 4821
   # then run the printed `select set_swap_pin('…')` in the SQL Editor
   ```

6. **Add your staff and rename the floors.** Three floors are seeded
   (`ground`, `first`, `second`); rename them freely, but changing a *slug*
   un-pairs any tablet already on it.

7. **Pair each tablet**: open `/setup` on it, choose the floor, enter the setup
   code. It goes to that floor's board and stays there. Point the tablet's
   browser at `/` on boot and it reopens the right board by itself.

Going live on a wall: see [DEPLOYMENT.md](DEPLOYMENT.md).

## Changing the section sizes

The capacities — 1 nurse, 3 seniors, 5 assistants — live in **two** places that
must agree:

- `role_capacity()` in `supabase/migrations/0001_init.sql`
- `ROLE_SPECS` in `src/lib/board/roles.ts`

Change one without the other and the database's CHECK constraint rejects the
write. That is the intended way to find out.

`ROLE_SPECS` also carries `perRow` (how many cards before wrapping) and `weight`
(each section's share of the screen). Nothing else needs touching — the layout
has no breakpoints and no fixed sizes.
