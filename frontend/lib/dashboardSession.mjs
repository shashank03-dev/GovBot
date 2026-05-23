export function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function decodePhoneFromToken(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) {
      return '';
    }
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const json = JSON.parse(decoded);
    return normalizePhone(json.phone || json.sub || '');
  } catch {
    return '';
  }
}

export function resolveDashboardPhone({ queryPhone = '', storedPhone = '', token = '' } = {}) {
  return normalizePhone(queryPhone) || normalizePhone(storedPhone) || decodePhoneFromToken(token);
}

export function buildDashboardPhonePath(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return '/dashboard';
  }
  return `/dashboard?phone=${encodeURIComponent(normalized)}`;
}
