export const OFFICIAL_LOGIN_PATH = '/official-login';
export const DEFAULT_OFFICIAL_PATH = '/gov-dashboard';
export const OFFICIAL_SESSION_STORAGE_KEY = 'govbot_official_token';
export const OFFICIAL_USERNAME_STORAGE_KEY = 'govbot_official_username';

const OFFICIAL_ALLOWED_PREFIXES = ['/gov-dashboard', '/admin'];

export function sanitizeOfficialNextPath(nextPath = DEFAULT_OFFICIAL_PATH) {
  if (typeof nextPath !== 'string') {
    return DEFAULT_OFFICIAL_PATH;
  }

  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_OFFICIAL_PATH;
  }

  if (OFFICIAL_ALLOWED_PREFIXES.some((prefix) => nextPath === prefix || nextPath.startsWith(`${prefix}/`))) {
    return nextPath;
  }

  return DEFAULT_OFFICIAL_PATH;
}

export function buildOfficialLoginHref(nextPath = DEFAULT_OFFICIAL_PATH) {
  const safeNextPath = sanitizeOfficialNextPath(nextPath);
  return `${OFFICIAL_LOGIN_PATH}?next=${encodeURIComponent(safeNextPath)}`;
}

export function resolveOfficialSessionState({ hasMounted, storage }) {
  if (!hasMounted || !storage || typeof storage.getItem !== 'function') {
    return false;
  }

  return Boolean(storage.getItem(OFFICIAL_SESSION_STORAGE_KEY));
}

export function clearOfficialSession(storage) {
  if (!storage || typeof storage.removeItem !== 'function') {
    return;
  }

  storage.removeItem(OFFICIAL_SESSION_STORAGE_KEY);
  storage.removeItem(OFFICIAL_USERNAME_STORAGE_KEY);
}
