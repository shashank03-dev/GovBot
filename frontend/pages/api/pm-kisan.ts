import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { identifier } = req.body;
    const val = String(identifier || '').replace(/\s/g, '');

    if (!/^\d{11,12}$/.test(val)) {
      return res.status(400).json({ error: 'Enter a 12-digit Aadhaar or 11-digit Registration Number' });
    }

    const response = await fetch(
      buildBackendUrl('/pm-kisan/status'),
      buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: val }),
      }),
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
}
