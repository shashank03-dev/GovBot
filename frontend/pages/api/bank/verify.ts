import type { NextApiRequest, NextApiResponse } from 'next';

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
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/bank/mock/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, account_number, ifsc_code }),
      }
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
    return res.status(500).json({ error: 'Failed to verify bank account' });
  }
}
