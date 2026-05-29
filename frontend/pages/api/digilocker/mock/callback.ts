import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl, fetchBackend, isBackendTimeoutError } from '@/lib/backendApi.mjs';
import { resolveSessionAuthorizationHeader } from '@/lib/authSession.mjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { consent_id, action, callback_token } = req.query;

  if (!consent_id) {
    return res.status(400).json({ error: 'Consent ID required' });
  }
  if (!callback_token || typeof callback_token !== 'string') {
    return res.status(400).json({ error: 'Callback token required' });
  }

  try {
    const backendPath = `/api/digilocker/mock/callback?consent_id=${consent_id}&callback_token=${encodeURIComponent(callback_token)}&action=${action || 'approve'}`;
    const authorization = resolveSessionAuthorizationHeader({
      req,
      backendPath: '/api/digilocker/mock/callback',
    });
    const response = await fetchBackend(
      buildBackendUrl(backendPath),
      buildBackendRequestInit({
        headers: authorization ? { Authorization: authorization } : {},
      }),
    );

    if (!response.ok) {
      throw new Error('Callback failed');
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('DigiLocker callback error:', error);
    if (isBackendTimeoutError(error)) {
      return res.status(504).json({ error: 'DigiLocker callback timed out' });
    }
    return res.status(500).json({ error: 'DigiLocker callback failed' });
  }
}
