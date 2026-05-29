export const LOCAL_BACKEND_FALLBACK = 'http://localhost:8000';
export const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';
export const DEFAULT_BACKEND_FETCH_TIMEOUT_MS = 20_000;
export const LONG_BACKEND_FETCH_TIMEOUT_MS = 60_000;
const BUNDLED_NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const BUNDLED_NEXT_PUBLIC_RAILWAY_URL = process.env.NEXT_PUBLIC_RAILWAY_URL || '';

function normalizeTimeoutMs(timeoutMs) {
  const value = Number(timeoutMs ?? process.env.BACKEND_FETCH_TIMEOUT_MS ?? DEFAULT_BACKEND_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BACKEND_FETCH_TIMEOUT_MS;
}

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

export function isBackendTimeoutError(error) {
  return error?.name === 'TimeoutError';
}

export async function fetchBackend(input, init = {}, options = {}) {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let upstreamAborted = false;

  const abortFromUpstream = () => {
    upstreamAborted = true;
    controller.abort(upstreamSignal?.reason);
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Backend request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !upstreamAborted) {
      const timeoutError = new Error(`Backend request timed out after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', abortFromUpstream);
    }
  }
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

export function buildFormScannerScreenshotApiPath(screenshotPath = '') {
  const normalized = String(screenshotPath || '').replace(/^\/+/, '');
  return buildProxyApiPath(`form-scanner/screenshot/${normalized}`);
}

export function resolveBackendProxyPath(path = '') {
  const normalized = String(path || '').replace(/^\/+/, '');
  if (!normalized) {
    return null;
  }

  const exactMatchMap = new Map([
    ['send-otp', '/auth/send-otp'],
    ['verify-otp', '/auth/verify-otp'],
    ['pm-kisan', '/pm-kisan/status'],
  ]);

  if (exactMatchMap.has(normalized)) {
    return exactMatchMap.get(normalized);
  }

  if (normalized === 'auth/official/login' || normalized.startsWith('auth/official/login/')) {
    return `/${normalized}`;
  }

  const prefixMap = [
    ['ocr/', '/ocr/'],
    ['documents/', '/documents/'],
    ['bank/', '/api/bank/'],
    ['digilocker/', '/api/digilocker/'],
    ['credentials/', '/api/credentials/'],
    ['analytics/', '/api/analytics/'],
    ['admin/', '/api/admin/'],
    ['treasury/', '/api/treasury/'],
    ['live/', '/live/'],
    ['applications/', '/applications/'],
    ['profile/', '/profile/'],
    ['form-scanner/', '/form-scanner/'],
    ['eligibility/', '/eligibility/'],
    ['renewals/', '/renewals/'],
    ['portals/', '/portals/'],
    ['ssp/', '/api/ssp/'],
  ];

  for (const [prefix, destinationPrefix] of prefixMap) {
    if (normalized.startsWith(prefix)) {
      return `${destinationPrefix}${normalized.slice(prefix.length)}`;
    }
  }

  if (normalized === 'portals') {
    return '/portals';
  }

  return null;
}

export function buildBackendProxyUrl(path = '', env = process.env) {
  const backendPath = resolveBackendProxyPath(path);
  if (!backendPath) {
    return null;
  }
  return buildBackendUrl(backendPath, env);
}
