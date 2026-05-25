import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl } from '@/lib/backendApi.mjs';
import { normalizeIndianPhone } from '@/lib/phoneStorage.mjs';

const MOCK_PROFILE = {
  name: 'SHASHANK GOWDA T',
  dob: '30/10/2006',
  gender: 'Male',
  aadhaar: '6634 0835 5424',
  email: 'frshashank7447@gmail.com',
  category: 'general',
  religion: 'hindu',
  income: '25000',
  domicile: 'Karnataka',
  district: 'Bengaluru North',
  institute: 'Sir M Vishveswraya Institute of Technology',
  course: 'Information Science',
  year: '2025',
  board: 'Karnataka School Examination and Assessment Board',
  marks: '95.5',
  admissionDate: '03/09/2025',
  accountHolder: 'SHASHANK GOWDA T',
  bankName: 'State Bank of India',
  accountNo: '325671904812',
  confirmAccountNo: '325671904812',
  ifsc: 'SBIN0012345',
  branch: 'HMT Layout',
  docs: ['Aadhaar Card', 'Income Certificate', 'Caste Certificate', 'Marksheet 2024'],
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, otp, mock_hint } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'phone and otp are required' });
  }

  if (
    typeof mock_hint === 'string' &&
    mock_hint.replace(/\D/g, '').slice(0, 6) === String(otp).replace(/\D/g, '').slice(0, 6)
  ) {
    const canonicalPhone = normalizeIndianPhone(phone);
    const profile = { ...MOCK_PROFILE, mobile: canonicalPhone };
    return res.status(200).json({ success: true, profile, delivery_mode: 'demo', phone: canonicalPhone });
  }

  try {
    const response = await fetch(
      buildBackendUrl('/auth/verify-otp'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp }),
      }),
    );

    const data = await response.json();

    if (!response.ok || data.valid === false) {
      return res.status(401).json({ success: false, error: data.error || 'Invalid or expired OTP' });
    }

    // Merge the actual phone number into the profile
    const canonicalPhone = normalizeIndianPhone(data.phone || phone);
    const profile = { ...MOCK_PROFILE, mobile: canonicalPhone };

    return res.status(200).json({ success: true, profile, delivery_mode: 'whatsapp', phone: canonicalPhone });
  } catch {
    return res.status(500).json({ error: 'Verification failed' });
  }
}
