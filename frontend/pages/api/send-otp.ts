import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl, fetchBackend, isBackendTimeoutError } from '@/lib/backendApi.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { phone, purpose } = req.body;

  try {
    const response = await fetchBackend(
      buildBackendUrl('/auth/send-otp'),
      buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, purpose }),
      }),
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    if (isBackendTimeoutError(error)) {
      return res.status(504).json({ message: 'OTP service timed out' });
    }
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
