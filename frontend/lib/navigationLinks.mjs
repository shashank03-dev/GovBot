export const DEFAULT_POST_LOGIN_PATH = '/dashboard';
export const TRACK_SEARCH_HREF = '/track-search';

export function sanitizePostLoginPath(nextPath = DEFAULT_POST_LOGIN_PATH) {
  if (typeof nextPath !== 'string') {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return nextPath;
}

export function buildDashboardLoginHref(nextPath = DEFAULT_POST_LOGIN_PATH) {
  const safeNextPath = sanitizePostLoginPath(nextPath);
  return `/login?next=${encodeURIComponent(safeNextPath)}`;
}

export function buildTrackHref(confirmationNumber) {
  return `/track/${encodeURIComponent(String(confirmationNumber ?? ''))}`;
}
