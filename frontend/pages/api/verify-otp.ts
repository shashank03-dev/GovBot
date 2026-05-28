import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { setCitizenSessionCookie } from '@/lib/authSession.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { phone, code, otp, purpose } = req.body;

  try {
    const response = await fetch(
      buildBackendUrl('/auth/verify-otp'),
      buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, code: code || otp, purpose }),
      }),
    );

    const data = await response.json();
    if (!response.ok || !data.valid || !data.token || !data.phone) {
      return res.status(response.status).json(data);
    }

    setCitizenSessionCookie(res, data.token);
    return res.status(response.status).json({
      valid: true,
      phone: data.phone,
    });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
