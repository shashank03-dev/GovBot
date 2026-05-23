export const LOCAL_BACKEND_FALLBACK = 'http://localhost:8000';

export function resolveBackendBaseUrl(env = process.env) {
  const candidates = [
    env.BACKEND_URL,
    env.API_URL,
    env.NEXT_PUBLIC_API_URL,
    env.NEXT_PUBLIC_RAILWAY_URL,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '');
    }
  }

  return LOCAL_BACKEND_FALLBACK;
}

export function buildProxyApiPath(path = '') {
  const normalized = String(path).replace(/^\/+/, '');
  return normalized ? `/api/${normalized}` : '/api';
}

export function buildApplicationTimelineApiPath(confirmationNumber) {
  return buildProxyApiPath(`applications/${encodeURIComponent(String(confirmationNumber))}/timeline`);
}
