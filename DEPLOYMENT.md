# Deployment checklist — Harbour Care Centre on-duty noticeboard

Work through this before the first tablet goes on a wall.

## Must do before go-live

- [ ] **Apply both migrations** in `supabase/migrations/`, in filename order
      (`supabase db push`, or paste each into the SQL Editor). Both are
      idempotent and safe to re-run.
- [ ] **Confirm the photo bucket is private.** Storage → `staff-photos` →
      Public should be **off**. `0002_storage.sql` sets it, and re-running the
      migration resets it if someone flips it. A public bucket hands every staff
      photograph to anyone who guesses an object path.
- [ ] **Disable public signups** in Supabase → Authentication → Providers.
      Otherwise anyone who reaches `/admin` can create themselves an account.
- [ ] **Create the administrator account by invite** in the Supabase dashboard.
- [ ] **Set `BOARD_SETUP_TOKEN`** to a long random value:
      `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
      Required — board endpoints refuse every request without it in production,
      rather than publishing the staff list.
- [ ] **Set the swap PIN** at `/admin/settings`. Until one exists the tablets
      refuse every swap.
- [ ] **Agree who knows the PIN.** It is one PIN for the whole building. Nurses
      in charge is the obvious answer; every care assistant is not.
- [ ] **Rename the floors** to match the building, and check the slugs before
      pairing anything. Renaming a floor later is safe; changing its *slug*
      un-pairs every tablet on it.
- [ ] **Add staff and photographs.** Head-and-shoulders shots; they are resized
      in the browser on upload, so photographing everyone on a phone is fine.
- [ ] **Serve over HTTPS.** Supabase Auth cookies and the device cookie both
      depend on it (`secure` is set in production).

## Verify after deploying

- [ ] `/` on a paired tablet opens that floor's board and nothing else.
- [ ] A floor with nobody on shows "Nobody is recorded on duty for this shift
      yet" — not three empty sections.
- [ ] A floor with one nurse and two assistants fills the screen, with no
      scrolling and no empty placeholder tiles.
- [ ] Tapping a photograph asks for the PIN, and a correct PIN drops straight
      into the swap for **that** person, not back to the board.
- [ ] A wrong PIN says so and clears the pad. Eight wrong PINs in a quarter hour
      returns "Too many incorrect PINs".
- [ ] After unlocking, the header shows a countdown and a **Done** button, and
      Done re-locks immediately.
- [ ] "Remove — nobody covering" empties a slot and the section gets shorter.
- [ ] Swapping two people between slots on one floor works — it should read as a
      move, not fail on a constraint.
- [ ] The swap modal flags somebody already on another floor tonight.
- [ ] A change made on one tablet appears on the admin overview within a second
      or two, and on another tablet within about ten.
- [ ] **Cross the handover.** Fill tomorrow's night shift in `/admin/rota`,
      then check the board at 20:00: it should change to those people on its own
      and turn indigo. If you cannot wait, temporarily move the server clock, or
      check `select * from current_shift();`.
- [ ] Pull a tablet's network: after three failed polls the header shows "Not
      updating", and it recovers on its own.
- [ ] Archiving somebody removes them from the current and future shifts and
      says how many, while older shifts still list them in the rota screen.
- [ ] **Confirm the anon key cannot read anything** — RLS should deny it:
      ```
      curl "$SUPABASE_URL/rest/v1/staff?select=*" -H "apikey: $ANON_KEY"
      ```
      This must return an empty array or a permission error, never staff rows.
      Repeat for `shift_assignments` and `floors`.
- [ ] **Confirm the board endpoints are closed.** From a machine that has never
      been paired and is not signed in:
      ```
      curl -si https://notice.harbourcare.co.uk/api/board/ground | head -1
      ```
      Must be `401`. A `200` means anyone with the URL can read tonight's rota.

      This one is not optional and not theoretical. During development the
      production build silently optimised the guard down to "always allow",
      while type-checking and building clean — see the note on `mayAccessFloor`
      in `src/lib/board/guard.ts`. **Re-run this curl after every deploy**, not
      just the first one. It is the only check that catches that class of fault.

## Tablet setup

- [ ] **Lock the orientation to portrait.** The layout is designed for it, and
      an unlocked tablet will reflow to landscape the first time it is knocked.
- [ ] Android kiosk / lock-task mode, with status and navigation bars hidden.
- [ ] Disable the system keyboard if the launcher allows it — the board never
      needs one, and its microphone and settings keys are a breakout route.
- [ ] Display sleep off, or long enough to cover the quietest part of the night.
      The board refreshes on wake, so a sleeping tablet is correct as soon as
      somebody touches it — but a dark board on a wall looks broken.
- [ ] Screen brightness down overnight if the tablet is near bedrooms.
- [ ] Auto-launch the browser at `/` on boot, so a power cut does not leave a
      floor without a board.
- [ ] **The tablet's browser must persist cookies.** Pairing stores an httpOnly
      cookie; a browser set to clear data on exit needs re-pairing after every
      reboot.

## Public hosting (Cloudflare Tunnel)

Same arrangement as the visitor kiosk: a Windows server at home, published
through a Cloudflare Tunnel. Every route is reachable from the open internet, so
these are not optional.

- [ ] **Put Cloudflare Access in front of `/admin`.** Free at this user count.
      Supabase Auth stays as the layer behind it; the point is that the login
      form is not reachable from the open internet at all.
- [ ] **Rate-limit `/api/board/pair` and `/api/board/*/unlock` at the edge.** The
      app limits attempts in memory, which is per-process and resets on restart.
      The edge is the better place, and it is the layer that survives a deploy.
- [ ] **Never expose the service-role key to the tunnel.** Server-side only, and
      never in a `NEXT_PUBLIC_` variable.
- [ ] Run the app as a Windows service so it survives reboot, and make sure the
      tunnel and the app come back in the right order.
- [ ] If the board and the kiosk share a hostname, give them separate subdomains
      — the two apps set different cookies and separate origins keep them from
      interfering.

Security headers (`frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`) are set in `next.config.ts`. There is deliberately **no
full Content-Security-Policy** yet: Next's inline bootstrap needs nonce
plumbing, and a half-configured CSP that silently blanks a board is worse than
none. Worth adding as a follow-up, with the boards retested afterwards.

### Data protection

Staff names and photographs are personal data, and `shift_assignments` is a
record of who was working when — which is employment data, and more sensitive
than the visitor log.

- [ ] Tell staff the board exists, what it shows, and where it is displayed.
      Photographs of employees on a screen visible to residents, families and
      contractors need a lawful basis and, in practice, a conversation.
- [ ] Offer an opt-out that still works: someone who does not want their
      photograph shown can be added with no photo, and the board falls back to
      their initials. This is deliberate.
- [ ] Agree a retention period for `shift_assignments` with whoever owns data
      protection for the home. Nothing prunes old rows today.
- [ ] Confirm Supabase automated backups are on, and check the project region
      suits your obligations.

## Known gaps

- **Nothing prunes old shifts.** `shift_assignments` grows by up to nine rows
  per floor per shift — small, but unbounded. See the retention item above.
- **Deleting a staff member deletes their whole shift history** (the foreign key
  cascades). Archiving is the safe action and is what the UI offers first;
  permanent deletion is only reachable from the archived tab and needs CONFIRM
  typed.
- **The in-memory rate limiter is per-process and resets on restart.** Adequate
  for one Node process on one server; put the real limit at the Cloudflare edge.
- **A board with no network shows the last data it had**, with a "Not updating"
  warning in the header. It does not blank itself. For a noticeboard that is the
  right trade — but it does mean a long outage can leave a stale board on a
  wall, honestly labelled.
- **One PIN for the whole building.** No per-floor or per-person PINs, and no
  record of who made a swap. If you need to know who changed the board, that is
  a schema change (`shift_assignments` would need a `changed_by`).
- **The rota planner has no week view.** One floor, one shift at a time. Fine for
  filling in tomorrow night; tedious for planning a fortnight.
