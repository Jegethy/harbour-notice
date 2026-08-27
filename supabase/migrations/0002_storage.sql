-- ============================================================================
-- 0002_storage.sql — the staff photo bucket
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- staff-photos — private, deliberately.
--
-- A public bucket would hand every staff photograph to anyone who guessed an
-- object path, with no login and no audit. These are photographs of care staff
-- at their place of work; they are personal data and they stay behind a
-- credential.
--
-- Nothing reads this bucket directly. Photos reach a tablet through
-- /api/photo/[staffId], which checks the device cookie and streams the object
-- using the service-role key. That keeps the URL on the board stable — so the
-- browser caches it and the photo does not flash on every poll — which a signed
-- URL, changing on each request, could not do.
--
-- The 2MB cap is a backstop. The admin panel downscales in the browser before
-- upload, so a real submission arrives at roughly 60-120KB.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-photos',
  'staff-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created on purpose. Every read and write goes through
-- the service-role key in a server route, which bypasses RLS; anon and
-- authenticated get nothing, which is the intended posture. If you later want
-- the admin panel to talk to storage directly from the browser, add a policy
-- for `authenticated` here rather than making the bucket public.
