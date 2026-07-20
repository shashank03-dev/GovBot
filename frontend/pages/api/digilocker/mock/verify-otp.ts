import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl, fetchBackend, isBackendTimeoutError } from '@/lib/backendApi.mjs';
import { setCitizenSessionCookie } from '@/lib/authSession.mjs';
import { normalizeIndianPhone } from '@/lib/phoneStorage.mjs';

// Synthetic showcase data only — must stay in sync with NSP_DEMO_DATA in
// frontend/lib/nspDemoAutofill.mjs and MOCK_BANK_ACCOUNTS in gov_agent/npci_router.py.
const MOCK_PROFILE = {
  name: 'DEMO CITIZEN KUMAR',
  dob: '15/06/2005',
  gender: 'Male',
  aadhaar: '9999 0000 1234',
  email: 'demo@govbot.test',
  category: 'obc',
  religion: 'hindu',
  income: '98000',
  domicile: 'Karnataka',
  district: 'Bengaluru North',
  institute: 'Demo Institute of Technology',
  course: 'Information Science',
  year: '2025',
  board: 'Karnataka School Examination and Assessment Board',
  marks: '95.5',
  admissionDate: '03/09/2025',
  accountHolder: 'DEMO CITIZEN KUMAR',
  bankName: 'State Bank of India',
  accountNo: '000011112222',
  confirmAccountNo: '000011112222',
  ifsc: 'SBIN0012345',
  branch: 'Demo Branch',
  docs: ['Aadhaar Card', 'Income and Caste Certificate', 'Marksheet 2025'],
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'phone and otp are required' });
  }

  try {
    const response = await fetchBackend(
      buildBackendUrl('/auth/verify-otp'),
      buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp, purpose: 'digilocker' }),
      }),
    );

    const data = await response.json();

    if (!response.ok || data.valid === false) {
      return res.status(401).json({ success: false, error: data.error || 'Invalid or expired OTP' });
    }
    if (!data.token) {
      return res.status(500).json({ success: false, error: 'Session token missing from auth response' });
    }

    // Merge the actual phone number into the profile
    const canonicalPhone = normalizeIndianPhone(data.phone || phone);
    const profile = { ...MOCK_PROFILE, mobile: canonicalPhone };
    setCitizenSessionCookie(res, data.token);

    return res.status(200).json({ success: true, profile, delivery_mode: 'whatsapp', phone: canonicalPhone });
  } catch (error) {
    if (isBackendTimeoutError(error)) {
      return res.status(504).json({ error: 'DigiLocker OTP verification timed out' });
    }
    return res.status(500).json({ error: 'Verification failed' });
  }
}
