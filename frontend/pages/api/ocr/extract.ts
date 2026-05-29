import type { NextApiRequest, NextApiResponse } from 'next';
import {
  LONG_BACKEND_FETCH_TIMEOUT_MS,
  buildBackendRequestInit,
  buildBackendUrl,
  fetchBackend,
  isBackendTimeoutError,
} from '@/lib/backendApi.mjs';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const response = await fetchBackend(
      buildBackendUrl('/ocr/extract'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      }),
      { timeoutMs: LONG_BACKEND_FETCH_TIMEOUT_MS },
    );
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    if (isBackendTimeoutError(error)) {
      return res.status(504).json({ error: 'OCR service timed out' });
    }
    return res.status(500).json({ error: 'OCR service error' });
  }
}
