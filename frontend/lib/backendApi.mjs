export const LOCAL_BACKEND_FALLBACK = 'http://localhost:8000';
export const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';
const BUNDLED_NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const BUNDLED_NEXT_PUBLIC_RAILWAY_URL = process.env.NEXT_PUBLIC_RAILWAY_URL || '';

export function resolveBackendBaseUrl(env = process.env) {
  const candidates = [
    env.BACKEND_URL,
    env.API_URL,
    env.NEXT_PUBLIC_API_URL,
    env.NEXT_PUBLIC_RAILWAY_URL,
    BUNDLED_NEXT_PUBLIC_API_URL,
    BUNDLED_NEXT_PUBLIC_RAILWAY_URL,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '');
    }
  }

  return LOCAL_BACKEND_FALLBACK;
}

export function shouldUseNgrokBypassHeader(env = process.env) {
  const backendUrl = resolveBackendBaseUrl(env);
  let hostname = String(backendUrl || '').toLowerCase();

  try {
    hostname = new URL(backendUrl).hostname.toLowerCase();
  } catch {
    // Fall back to string matching when the configured backend URL is not a full URL.
  }

  return (
    hostname.includes('ngrok-free') ||
    hostname.includes('.ngrok.app') ||
    hostname.includes('.ngrok.dev') ||
    hostname.includes('.ngrok.io')
  );
}

export function buildBackendRequestHeaders(headers = {}, env = process.env) {
  const merged = new Headers(headers || {});
  if (shouldUseNgrokBypassHeader(env)) {
    merged.set(NGROK_SKIP_BROWSER_WARNING_HEADER, 'true');
  }
  return Object.fromEntries(merged.entries());
}

export function buildBackendRequestInit(init = {}, env = process.env) {
  if (!init.headers && !shouldUseNgrokBypassHeader(env)) {
    return { ...init };
  }

  return {
    ...init,
    headers: buildBackendRequestHeaders(init.headers, env),
  };
}

export function buildBackendUrl(path = '', env = process.env) {
  const baseUrl = resolveBackendBaseUrl(env);
  const normalizedPath = String(path || '');
  if (!normalizedPath) {
    return baseUrl;
  }
  return `${baseUrl}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
}

export function buildProxyApiPath(path = '') {
  const normalized = String(path).replace(/^\/+/, '');
  return normalized ? `/api/${normalized}` : '/api';
}

export function buildApplicationTimelineApiPath(confirmationNumber) {
  return buildProxyApiPath(`applications/${encodeURIComponent(String(confirmationNumber))}/timeline`);
}
