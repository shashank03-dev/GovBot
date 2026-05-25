import type { NextRouter } from 'next/router';

import {
  OFFICIAL_SESSION_STORAGE_KEY,
  buildOfficialLoginHref,
  clearOfficialSession,
  sanitizeOfficialNextPath,
} from '@/lib/officialSession.mjs';

function redirectToOfficialLogin(router: NextRouter) {
  if (typeof window !== 'undefined') {
    clearOfficialSession(window.localStorage);
  }

  void router.replace(buildOfficialLoginHref(sanitizeOfficialNextPath(router.asPath)));
}

export async function fetchOfficialJson<T>(
  router: NextRouter,
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(OFFICIAL_SESSION_STORAGE_KEY) || '' : '';

  if (!token) {
    redirectToOfficialLogin(router);
    throw new Error('Official authentication required');
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 || response.status === 403) {
    redirectToOfficialLogin(router);
    throw new Error('Official authentication required');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Official request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function logoutOfficialSession(router: NextRouter, destination = '/services') {
  if (typeof window !== 'undefined') {
    clearOfficialSession(window.localStorage);
  }

  void router.push(destination);
}
