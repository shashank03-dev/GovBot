import type { NextApiRequest, NextApiResponse } from 'next';

import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { setCitizenSessionCookie } from '@/lib/authSession.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required' });
  }

  try {
    const response = await fetch(
      buildBackendUrl('/auth/exchange-handoff'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.valid || !payload?.token || !payload?.phone) {
      return res.status(response.status).json(payload);
    }

    setCitizenSessionCookie(res, payload.token);
    return res.status(200).json({
      valid: true,
      phone: payload.phone,
      next_path: payload.next_path,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to exchange login handoff' });
  }
}
