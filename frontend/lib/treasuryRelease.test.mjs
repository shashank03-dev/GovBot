import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExplorerTransactionUrl,
  extractWalletErrorMessage,
  buildReleaseReference,
  buildReleaseTransactionRequest,
  isApprovedTreasuryWallet,
  resolveTreasuryNetworkConfig,
  resolveBeneficiaryReleaseMessage,
  shouldShowUrgentBankVerificationBanner,
} from './treasuryRelease.mjs';

test('buildExplorerTransactionUrl normalizes the base path', () => {
  assert.equal(
    buildExplorerTransactionUrl('https://amoy.polygonscan.com/tx', '0xabc'),
    'https://amoy.polygonscan.com/tx/0xabc',
  );
});

test('isApprovedTreasuryWallet compares case-insensitively', () => {
  assert.equal(isApprovedTreasuryWallet('0xAbC', '0xabc'), true);
  assert.equal(isApprovedTreasuryWallet('0xdef', '0xabc'), false);
});

test('buildReleaseReference produces a short payload for chain anchoring', () => {
  const reference = buildReleaseReference({
    scheme: 'nsp',
    amountInr: 50000,
    beneficiaryCount: 2,
    officialUsername: 'district-ops',
    createdAt: '2026-05-26T12:00:00Z',
  });

  assert.match(reference, /^govbot\|release\|nsp\|50000\|2\|district-ops\|2026-05-26T12:00:00Z$/);
});

test('buildReleaseTransactionRequest creates a zero-value anchor transaction', () => {
  const request = buildReleaseTransactionRequest({
    from: '0xApPrOvEd',
    to: '0xAnChOr',
    dataHex: '0x1234',
    gasHex: '0x5208',
  });

  assert.deepEqual(request, {
    from: '0xapproved',
    to: '0xanchor',
    value: '0x0',
    data: '0x1234',
    gas: '0x5208',
  });
});

test('resolveTreasuryNetworkConfig returns Sepolia settings for the Sepolia chain id', () => {
  const config = resolveTreasuryNetworkConfig(11155111, 'Ethereum Sepolia');

  assert.equal(config.chainName, 'Ethereum Sepolia');
  assert.equal(config.nativeCurrency.symbol, 'ETH');
  assert.deepEqual(config.rpcUrls, ['https://ethereum-sepolia-rpc.publicnode.com']);
  assert.deepEqual(config.blockExplorerUrls, ['https://sepolia.etherscan.io/']);
});

test('extractWalletErrorMessage reads plain-object provider errors', () => {
  assert.equal(
    extractWalletErrorMessage({ message: 'User rejected the request.' }),
    'User rejected the request.',
  );
});

test('resolveBeneficiaryReleaseMessage marks bank verification as urgent when release is blocked', () => {
  assert.match(
    resolveBeneficiaryReleaseMessage({ release_authorized: true, action_required: 'verify_bank' }),
    /verify bank/i,
  );
});

test('shouldShowUrgentBankVerificationBanner only returns true for blocked released payouts', () => {
  assert.equal(
    shouldShowUrgentBankVerificationBanner({ release_authorized: true, action_required: 'verify_bank' }),
    true,
  );
  assert.equal(
    shouldShowUrgentBankVerificationBanner({ release_authorized: true, action_required: 'none' }),
    false,
  );
});
