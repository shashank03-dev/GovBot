import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl, fetchBackend, isBackendTimeoutError } from '@/lib/backendApi.mjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, account_number, ifsc_code } = req.body;

  if (!phone || !account_number || !ifsc_code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetchBackend(
      buildBackendUrl('/api/bank/mock/verify'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, account_number, ifsc_code }),
      }),
    );

    if (!response.ok) {
      throw new Error('Verification failed');
    }

    const data = await response.json();
    return res.status(200).json({
      ...data,
      success: data.status === 'success',
    });
  } catch (error) {
    console.error('Bank verification error:', error);
    if (isBackendTimeoutError(error)) {
      return res.status(504).json({ error: 'Bank verification timed out' });
    }
    return res.status(500).json({ error: 'Failed to verify bank account' });
  }
}
