import type { NextApiRequest, NextApiResponse } from 'next';

import { clearOfficialSessionCookie } from '@/lib/authSession.mjs';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  clearOfficialSessionCookie(res);
  return res.status(200).json({ ok: true });
}
