import type { NextApiRequest, NextApiResponse } from 'next';

import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { setOfficialSessionCookie } from '@/lib/authSession.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(
      buildBackendUrl('/auth/official/login'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      }),
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.token) {
      return res.status(response.status).json(payload);
    }

    setOfficialSessionCookie(res, payload.token);
    return res.status(200).json({
      username: payload.username,
      role: payload.role,
    });
  } catch {
    return res.status(500).json({ error: 'Official login failed' });
  }
}
