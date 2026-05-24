import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const response = await fetch(
      buildBackendUrl('/documents/validate'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      }),
    );
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Document validation error' });
  }
}
