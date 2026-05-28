import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { resolveSessionAuthorizationHeader } from '@/lib/authSession.mjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Missing required field: phone' });
  }

  try {
    const backendPath = '/api/bank/mock/ready';
    const authorization = resolveSessionAuthorizationHeader({
      req,
      backendPath,
      authorizationHeader: req.headers.authorization || '',
    });
    const response = await fetch(
      buildBackendUrl(backendPath),
      buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({ phone }),
      }),
    );

    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Bank ready error:', error);
    return res.status(500).json({ error: 'Failed to mark bank as ready for disbursement' });
  }
}
