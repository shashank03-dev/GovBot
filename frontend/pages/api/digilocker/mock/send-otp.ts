import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  try {
    const response = await fetch(
      buildBackendUrl('/auth/send-otp'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }),
    );

    const data = await response.json();
    if (!response.ok) {
      if (response.status < 500) {
        return res.status(response.status).json(data);
      }

      return res.status(200).json({
        success: true,
        delivery_mode: 'demo',
        otp_hint: '123456',
        message: 'Demo OTP is ready',
      });
    }

    return res.status(200).json({
      success: true,
      delivery_mode: 'whatsapp',
      message: 'OTP sent via WhatsApp',
    });
  } catch {
    return res.status(200).json({
      success: true,
      delivery_mode: 'demo',
      otp_hint: '123456',
      message: 'Demo OTP is ready',
    });
  }
}
