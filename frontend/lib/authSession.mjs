export const CITIZEN_SESSION_COOKIE_NAME = 'govbot_citizen_session';
export const OFFICIAL_SESSION_COOKIE_NAME = 'govbot_official_session';
export const CITIZEN_SESSION_STORAGE_KEY = 'govbot_token';
export const OFFICIAL_SESSION_STORAGE_KEY = 'govbot_official_token';
export const CITIZEN_SESSION_SENTINEL = 'cookie-session';
export const OFFICIAL_SESSION_SENTINEL = 'cookie-official-session';

const PLACEHOLDER_TOKENS = new Set([
  '',
  'null',
  'undefined',
  'session',
  CITIZEN_SESSION_SENTINEL,
  OFFICIAL_SESSION_SENTINEL,
]);

function isProductionEnv() {
  return process.env.NODE_ENV === 'production';
}

export function parseCookieHeader(cookieHeader = '') {
  const cookies = {};
  for (const pair of String(cookieHeader || '').split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const name = decodeURIComponent(trimmed.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(trimmed.slice(separatorIndex + 1).trim());
    cookies[name] = value;
  }
  return cookies;
}

export function getRequestCookie(req, cookieName) {
  return parseCookieHeader(req?.headers?.cookie || '')[cookieName] || '';
}

function serializeCookie(name, value, { maxAge = undefined, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }
  if (path) {
    parts.push(`Path=${path}`);
  }
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }
  if (httpOnly) {
    parts.push('HttpOnly');
  }
  if (isProductionEnv()) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function appendSetCookie(res, serializedCookie) {
  const currentHeader = res.getHeader('Set-Cookie');
  if (!currentHeader) {
    res.setHeader('Set-Cookie', serializedCookie);
    return;
  }
  if (Array.isArray(currentHeader)) {
    res.setHeader('Set-Cookie', [...currentHeader, serializedCookie]);
    return;
  }
  res.setHeader('Set-Cookie', [currentHeader, serializedCookie]);
}

export function setCitizenSessionCookie(res, token) {
  appendSetCookie(
    res,
    serializeCookie(CITIZEN_SESSION_COOKIE_NAME, token, {
      maxAge: 60 * 60 * 24 * 7,
    }),
  );
}

export function clearCitizenSessionCookie(res) {
  appendSetCookie(
    res,
    serializeCookie(CITIZEN_SESSION_COOKIE_NAME, '', {
      maxAge: 0,
    }),
  );
}

export function setOfficialSessionCookie(res, token) {
  appendSetCookie(
    res,
    serializeCookie(OFFICIAL_SESSION_COOKIE_NAME, token, {
      maxAge: 60 * 60 * 12,
    }),
  );
}

export function clearOfficialSessionCookie(res) {
  appendSetCookie(
    res,
    serializeCookie(OFFICIAL_SESSION_COOKIE_NAME, '', {
      maxAge: 0,
    }),
  );
}

function isJwtLikeToken(token) {
  const parts = String(token || '').trim().split('.');
  return parts.length === 3 && parts.every(Boolean);
}

function normalizeBearerToken(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  const prefix = /^Bearer\s+/i;
  if (!prefix.test(trimmed)) {
    return '';
  }
  return trimmed.replace(prefix, '').trim();
}

export function shouldReplaceAuthorizationHeader(authorizationHeader = '') {
  const token = normalizeBearerToken(authorizationHeader);
  if (!token) {
    return true;
  }
  if (PLACEHOLDER_TOKENS.has(token)) {
    return true;
  }
  return !isJwtLikeToken(token);
}

export function usesOfficialSession(backendPath = '') {
  const normalizedPath = String(backendPath || '');
  return (
    normalizedPath.startsWith('/api/analytics/') ||
    normalizedPath.startsWith('/api/admin/') ||
    normalizedPath.startsWith('/api/treasury/') ||
    normalizedPath.startsWith('/auth/official/')
  );
}

export function resolveSessionAuthorizationHeader({ req, backendPath = '', authorizationHeader = '' }) {
  if (!shouldReplaceAuthorizationHeader(authorizationHeader)) {
    return authorizationHeader;
  }

  const cookieName = usesOfficialSession(backendPath)
    ? OFFICIAL_SESSION_COOKIE_NAME
    : CITIZEN_SESSION_COOKIE_NAME;
  const sessionToken = getRequestCookie(req, cookieName);
  if (!sessionToken) {
    return '';
  }
  return `Bearer ${sessionToken}`;
}
