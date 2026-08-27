/**
 * Where a staff photograph is fetched from.
 *
 * Client-safe. Deliberately a stable path plus a version query rather than a
 * Supabase signed URL: the board re-polls every few seconds, and a signed URL
 * would come back different every time, so the browser would treat each poll as
 * a new image and every face on the wall would blink. A stable URL is fetched
 * once and served from cache until the version changes.
 *
 * `v` is the photo's own updated_at, so replacing someone's picture in the
 * admin panel changes the URL exactly once and the tablet picks it up on its
 * next poll without a cache-busting hack.
 */
export function photoUrl(staffId: string, photoUpdatedAt: string | null): string {
  const version = photoUpdatedAt ? Date.parse(photoUpdatedAt) : 0;
  return `/api/photo/${staffId}?v=${Number.isFinite(version) ? version : 0}`;
}
