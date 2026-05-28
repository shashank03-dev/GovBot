export function buildExplorerTransactionUrl(baseUrl = '', txHash = '') {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const cleanHash = String(txHash || '').trim();
  if (!cleanBase || !cleanHash) {
    return '';
  }
  return `${cleanBase}/${cleanHash}`;
}

const TREASURY_NETWORK_CONFIGS = {
  80002: {
    chainName: 'Polygon Amoy',
    nativeCurrency: {
      name: 'POL',
      symbol: 'POL',
      decimals: 18,
    },
    rpcUrls: ['https://rpc-amoy.polygon.technology/'],
    blockExplorerUrls: ['https://amoy.polygonscan.com/'],
  },
  11155111: {
    chainName: 'Ethereum Sepolia',
    nativeCurrency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io/'],
  },
};

export function resolveTreasuryNetworkConfig(chainId = 0, networkName = '') {
  const normalizedChainId = Number(chainId) || 0;
  const config = TREASURY_NETWORK_CONFIGS[normalizedChainId];
  if (config) {
    return {
      chainId: normalizedChainId,
      chainName: config.chainName,
      nativeCurrency: { ...config.nativeCurrency },
      rpcUrls: [...config.rpcUrls],
      blockExplorerUrls: [...config.blockExplorerUrls],
    };
  }

  return {
    chainId: normalizedChainId,
    chainName: String(networkName || '').trim() || `Chain ${normalizedChainId || 'Unknown'}`,
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: [],
    blockExplorerUrls: [],
  };
}

export function extractWalletErrorMessage(error, fallback = 'Treasury wallet request failed.') {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const message = error.message || error.reason || error.details || error.data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
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

export function buildReleaseTransactionRequest({ from = '', to = '', dataHex = '', gasHex = '' }) {
  const request = {
    from: String(from || '').trim().toLowerCase(),
    to: String(to || '').trim().toLowerCase(),
    value: '0x0',
  };
  const cleanData = String(dataHex || '').trim();
  const cleanGas = String(gasHex || '').trim();
  if (cleanData) {
    request.data = cleanData;
  }
  if (cleanGas) {
    request.gas = cleanGas;
  }
  return request;
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
