export function normalizeIndianPhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}

export function toLocalTenDigitPhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length <= 10) {
    return digits;
  }

  return digits.slice(-10);
}

export function buildPhoneLookupCandidates(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  const canonical = normalizeIndianPhone(phone);

  return [...new Set([digits, canonical].filter(Boolean))];
}
