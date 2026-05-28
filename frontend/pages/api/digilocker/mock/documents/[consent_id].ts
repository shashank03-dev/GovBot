import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { resolveSessionAuthorizationHeader } from '@/lib/authSession.mjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { consent_id } = req.query;

  if (!consent_id || typeof consent_id !== 'string') {
    return res.status(400).json({ error: 'Consent ID required' });
  }

  try {
    const backendPath = `/api/digilocker/mock/documents/${consent_id}`;
    const authorization = resolveSessionAuthorizationHeader({ req, backendPath });
    const response = await fetch(
      buildBackendUrl(backendPath),
      buildBackendRequestInit({
        headers: authorization ? { Authorization: authorization } : {},
      }),
    );

    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('DigiLocker documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
}
