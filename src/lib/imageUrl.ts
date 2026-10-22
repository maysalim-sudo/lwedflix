/**
 * A local file, not a remote placeholder service.
 *
 * This used to point at via.placeholder.com, which has since stopped
 * resolving entirely — so every title TMDB has no artwork for rendered as a
 * broken image. Dev hid it behind a warm image cache while production, built
 * fresh, showed the breakage. Serving it from /public means the fallback
 * can't go down, and needs no remotePatterns entry.
 */
export const PLACEHOLDER_IMAGE = '/placeholder-poster.png';

export function getImageUrl(path: string | null, size: string = 'original') {
  if (!path) return PLACEHOLDER_IMAGE;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
