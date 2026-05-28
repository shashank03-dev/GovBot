import { buildProxyApiPath } from './backendApi.mjs';

export function buildCredentialRecordApiPath(credentialId) {
  return buildProxyApiPath(`credentials/id/${encodeURIComponent(String(credentialId || '').trim())}`);
}

export function buildCredentialByConfirmationApiPath(confirmationNumber) {
  return buildProxyApiPath(
    `credentials/by-confirmation/${encodeURIComponent(String(confirmationNumber || '').trim())}`,
  );
}

export function buildCredentialVerifyApiPath(credentialId) {
  return buildProxyApiPath(`credentials/verify/${encodeURIComponent(String(credentialId || '').trim())}`);
}
