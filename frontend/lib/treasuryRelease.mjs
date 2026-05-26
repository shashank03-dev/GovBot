export function buildExplorerTransactionUrl(baseUrl = '', txHash = '') {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const cleanHash = String(txHash || '').trim();
  if (!cleanBase || !cleanHash) {
    return '';
  }
  return `${cleanBase}/${cleanHash}`;
}

export function isApprovedTreasuryWallet(address = '', approvedAddress = '') {
  const left = String(address || '').trim().toLowerCase();
  const right = String(approvedAddress || '').trim().toLowerCase();
  return Boolean(left) && Boolean(right) && left === right;
}

export function buildReleaseReference({
  scheme = '',
  amountInr = 0,
  beneficiaryCount = 0,
  officialUsername = '',
  createdAt = '',
}) {
  return [
    'govbot',
    'release',
    String(scheme || '').trim().toLowerCase(),
    String(Number(amountInr) || 0),
    String(Number(beneficiaryCount) || 0),
    String(officialUsername || '').trim(),
    String(createdAt || '').trim(),
  ].join('|');
}

export function buildReleaseTransactionRequest({ from = '', to = '', dataHex = '' }) {
  return {
    from: String(from || '').trim(),
    to: String(to || '').trim(),
    value: '0x0',
    data: String(dataHex || '').trim(),
  };
}

export function resolveBeneficiaryReleaseMessage(status = {}) {
  if (!status?.release_authorized) {
    return 'Funds have not been released for your scholarship yet.';
  }

  if (status?.action_required === 'verify_bank') {
    return 'Funds have been released. Verify bank details now so the payment can reach this account.';
  }

  return 'Funds have been released and payout processing is underway.';
}

export function shouldShowUrgentBankVerificationBanner(status = {}) {
  return Boolean(status?.release_authorized && status?.action_required === 'verify_bank');
}
