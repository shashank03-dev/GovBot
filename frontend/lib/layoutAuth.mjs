import { buildDashboardLoginHref } from './navigationLinks.mjs';

export function resolveLoggedInState({ hasMounted, storage }) {
  if (!hasMounted || !storage || typeof storage.getItem !== 'function') {
    return false;
  }

  return Boolean(storage.getItem('govbot_token'));
}

export function resolveProtectedRouteRedirect({
  hasMounted,
  storage,
  nextPath,
  requiredKeys = ['govbot_token'],
}) {
  if (!hasMounted || !storage || typeof storage.getItem !== 'function') {
    return null;
  }

  const missingRequiredValue = requiredKeys.some((key) => !storage.getItem(key));
  if (!missingRequiredValue) {
    return null;
  }

  return buildDashboardLoginHref(nextPath);
}
