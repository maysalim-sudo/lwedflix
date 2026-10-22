/**
 * Links people send each other: invites, watch parties, titles, posts.
 *
 * The app serves its pages from 127.0.0.1, which means nothing on anyone
 * else's machine, so links use the app's own scheme instead —
 * lwedflix://movie/550 opens that page in the recipient's Lwedflix.
 */

const APP_SCHEME = 'lwedflix';

// Pages an lwedflix:// link may open. electron/main.js keeps the same list
// for links arriving from outside the app; keep the two in step.
const APP_LINK_PATH = /^\/(?:(?:movie|tv|person)\/\d{1,10}|(?:watch|invite|p|u|c)\/[\w.-]{1,64})$/;
const APP_LINK_QUERY = /^(\?[\w=&-]{0,100})?$/;

/** `path` is an app path such as `/movie/550` or `/tv/1429?season=1`. */
export function shareUrl(path: string): string {
  return `${APP_SCHEME}:/${path}`;
}

/** The app path an lwedflix:// link points at, or null if it isn't one we open. */
export function appLinkPath(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== `${APP_SCHEME}:`) return null;
    // lwedflix://movie/550 parses with "movie" as the host.
    const path = `/${url.host}${url.pathname}`.replace(/\/+$/, '');
    return APP_LINK_PATH.test(path) && APP_LINK_QUERY.test(url.search) ? path + url.search : null;
  } catch {
    return null;
  }
}
