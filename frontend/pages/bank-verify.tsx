import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CITIZEN_SESSION_SENTINEL, CITIZEN_SESSION_STORAGE_KEY } from '@/lib/authSession.mjs';
import { getErrorMessage } from '@/lib/errorMessage';
import { resolveProtectedRouteRedirect } from '@/lib/layoutAuth.mjs';
import { normalizeIndianPhone } from '@/lib/phoneStorage.mjs';
import {
  resolveBeneficiaryReleaseMessage,
  shouldShowUrgentBankVerificationBanner,
} from '@/lib/treasuryRelease.mjs';

interface VerifyResult {
  success: boolean;
  beneficiary_name?: string;
  bank_name?: string;
  branch?: string;
  account_type?: string;
  message?: string;
  transaction_id?: string;
  penny_drop_status?: string;
}

interface BankReadyResult {
  ready: boolean;
  status?: string;
  message?: string;
  confirmation_number?: string;
  disbursement_id?: string;
}

interface BeneficiaryReleaseStatus {
  release_authorized: boolean;
  action_required: string;
  message?: string;
  scheme?: string;
}

export default function BankVerifyPage() {
  const [mounted, setMounted] = useState(false);
  const [phone, setPhone] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'verifying' | 'result' | 'otp' | 'ready'>('form');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [readyResult, setReadyResult] = useState<BankReadyResult | null>(null);
  const [error, setError] = useState('');
  const [verifyStage, setVerifyStage] = useState(0);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState<BeneficiaryReleaseStatus | null>(null);
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const redirectTarget = resolveProtectedRouteRedirect({
      hasMounted: true,
      storage: localStorage,
      nextPath: '/bank-verify',
      requiredKeys: ['govbot_token', 'govbot_phone'],
    });
    const storedPhone = localStorage.getItem('govbot_phone');
    if (redirectTarget || !storedPhone) {
      void router.replace(redirectTarget || '/login?next=%2Fbank-verify');
      return;
    }
    setPhone(storedPhone);
    void fetch(`/api/treasury/beneficiary/${storedPhone}`)
      .then((response) => response.json().catch(() => null))
      .then((payload) => {
        if (payload) {
          setReleaseStatus(payload as BeneficiaryReleaseStatus);
        }
      })
      .catch(() => {});
  }, [mounted, router]);

  if (!mounted) return null;

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const cleanIfsc = ifsc.trim().toUpperCase();
    const cleanAccount = accountNo.trim().replace(/\s/g, '');

    if (cleanIfsc.length !== 11) { setError('IFSC must be 11 characters'); return; }
    if (cleanAccount.length < 9) { setError('Account number must be at least 9 digits'); return; }

    setError('');
    setStep('verifying');
    setVerifyStage(0);
    setLoading(true);

    // Simulate progressive verification stages
    const stages = [
      { delay: 600, stage: 1 },
      { delay: 1200, stage: 2 },
      { delay: 1800, stage: 3 },
    ];
    for (const s of stages) {
      setTimeout(() => setVerifyStage(s.stage), s.delay);
    }

    try {
      const res = await fetch('/api/bank/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          account_number: cleanAccount,
          ifsc_code: cleanIfsc,
        }),
      });

      if (!res.ok) throw new Error('Verification request failed');
      const data: VerifyResult = await res.json();
      setResult(data);
      if (data.success) {
        setStep('otp');
        await sendOtp();
      } else {
        setStep('result');
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to verify bank account'));
      setStep('form');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setStep('form');
    setResult(null);
    setReadyResult(null);
    setError('');
    setIfsc('');
    setAccountNo('');
    setVerifyStage(0);
    setOtp('');
    setOtpError('');
    setOtpLoading(false);
    setOtpSent(false);
  }

  async function sendOtp() {
    setOtpLoading(true);
    setOtpError('');
    const canonicalPhone = normalizeIndianPhone(phone) || phone.trim();
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || data.message || 'Failed to send OTP');
      }
      setOtpSent(true);
    } catch (error: unknown) {
      setOtpError(getErrorMessage(error, 'Failed to send OTP'));
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setOtpError('Enter the 6-digit OTP from WhatsApp');
      return;
    }

    setOtpLoading(true);
    setOtpError('');
    const canonicalPhone = normalizeIndianPhone(phone) || phone.trim();
    try {
      const verifyRes = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone, code: otp.trim() }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.valid) {
        throw new Error(verifyData.error || verifyData.detail || verifyData.message || 'Invalid or expired OTP');
      }
      localStorage.setItem(CITIZEN_SESSION_STORAGE_KEY, CITIZEN_SESSION_SENTINEL);
      localStorage.setItem('govbot_phone', normalizeIndianPhone(verifyData.phone || canonicalPhone));

      const readyRes = await fetch('/api/bank/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone }),
      });
      const readyData: BankReadyResult = await readyRes.json();
      if (!readyRes.ok || !readyData.ready) {
        throw new Error(readyData.message || 'Failed to mark bank as ready for disbursement');
      }

      setReadyResult(readyData);
      setStep('ready');
    } catch (error: unknown) {
      setOtpError(getErrorMessage(error, 'OTP verification failed'));
    } finally {
      setOtpLoading(false);
    }
  }

  const VERIFY_STAGES = [
    { icon: '🔍', text: 'Validating IFSC code...' },
    { icon: '💰', text: 'Initiating penny drop (₹0.01)...' },
    { icon: '✅', text: 'Checking account status...' },
  ];

  return (
    <>
      <Head>
        <title>Bank Verification | GovBot</title>
        <meta name="description" content="Verify your bank account via NPCI penny drop for scholarship disbursement" />
      </Head>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
          ← Back to Services
        </Link>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Bank Verification
          </h1>
          <p className="text-sm text-slate-500 mt-1">NPCI penny drop verification for scholarship disbursement</p>
        </div>

        {releaseStatus && shouldShowUrgentBankVerificationBanner(releaseStatus) ? (
          <motion.section
            className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-base font-bold text-slate-900">Funds are already released for your scholarship</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {releaseStatus.message || resolveBeneficiaryReleaseMessage(releaseStatus)}
            </p>
          </motion.section>
        ) : null}

        {/* Form */}
        {step === 'form' && (
          <motion.section
            className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">IFSC Code</label>
                <input
                  type="text"
                  value={ifsc}
                  onChange={e => setIfsc(e.target.value.toUpperCase())}
                  placeholder="e.g. SBIN0001234"
                  maxLength={11}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all uppercase tracking-wider"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">11-character IFSC code from your bank passbook or cheque</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Account Number</label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={e => setAccountNo(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter account number"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all tracking-wider"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">9-18 digit account number</p>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}

              <button
                type="submit"
                disabled={loading || !ifsc || !accountNo}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
              >
                Verify Bank Account
              </button>
            </form>
          </motion.section>
        )}

        {/* Verifying Animation */}
        {step === 'verifying' && (
          <motion.section
            className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 text-center">Verifying Bank Account</h2>
            <div className="space-y-3">
              {VERIFY_STAGES.map((stage, i) => (
                <motion.div
                  key={i}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border ${
                    verifyStage > i
                      ? 'border-green-200 bg-green-50'
                      : verifyStage === i
                      ? 'border-[#ff9933]/30 bg-orange-50'
                      : 'border-slate-100 bg-slate-50'
                  } transition-colors`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.3 }}
                >
                  <div className="text-lg">
                    {verifyStage > i ? '✅' : verifyStage === i ? (
                      <span className="animate-spin inline-block">⏳</span>
                    ) : '⬜'}
                  </div>
                  <span className={`text-sm ${verifyStage >= i ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                    {stage.text}
                  </span>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-6">This takes a few seconds. Please wait...</p>
          </motion.section>
        )}

        {/* Result */}
        {step === 'result' && result && (
          <motion.section
            className={`border rounded-2xl p-6 ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg ${result.success ? 'bg-green-500' : 'bg-red-500'}`}>
                {result.success ? '✓' : '✕'}
              </div>
              <div>
                <h3 className={`text-base font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {result.success ? 'Bank Account Verified' : 'Verification Failed'}
                </h3>
                <p className="text-xs text-slate-500">
                  {result.message || (result.success ? 'Account is valid and active' : 'Please check your details')}
                </p>
              </div>
            </div>

            {result.success && (
              <div className="space-y-2.5">
                {result.beneficiary_name && (
                  <div className="bg-white/70 rounded-xl p-3.5 flex items-center gap-3">
                    <span className="text-lg">👤</span>
                    <div>
                      <div className="text-xs text-slate-400">Beneficiary Name</div>
                      <div className="text-sm font-semibold text-slate-900">{result.beneficiary_name}</div>
                    </div>
                  </div>
                )}
                {result.bank_name && (
                  <div className="bg-white/70 rounded-xl p-3.5 flex items-center gap-3">
                    <span className="text-lg">🏦</span>
                    <div>
                      <div className="text-xs text-slate-400">Bank</div>
                      <div className="text-sm font-medium text-slate-900">{result.bank_name}{result.branch ? ` — ${result.branch}` : ''}</div>
                    </div>
                  </div>
                )}
                {result.transaction_id && (
                  <div className="bg-white/70 rounded-xl p-3.5 flex items-center gap-3">
                    <span className="text-lg">🔗</span>
                    <div>
                      <div className="text-xs text-slate-400">Transaction ID</div>
                      <div className="text-sm font-mono text-slate-500">{result.transaction_id}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={resetForm}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
              {result.success ? 'Verify Another' : 'Try Again'}
              </button>
              {result.success && (
                <Link
                  href="/dashboard"
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm text-center font-semibold rounded-xl shadow-md hover:-translate-y-0.5 transition-all"
                >
                  View Dashboard →
                </Link>
              )}
            </div>
          </motion.section>
        )}

        {step === 'otp' && result && (
          <motion.section
            className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500 text-white flex items-center justify-center text-lg">✓</div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Bank account matched</h3>
                <p className="text-xs text-slate-500">Confirm this verified account with the OTP sent to your WhatsApp.</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {result.beneficiary_name && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-400">Beneficiary Name</div>
                  <div className="text-sm font-semibold text-slate-900">{result.beneficiary_name}</div>
                </div>
              )}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                <div className="text-xs text-slate-400">Verified Bank</div>
                <div className="text-sm font-medium text-slate-900">
                  {result.bank_name || 'Bank account verified'}{result.branch ? ` — ${result.branch}` : ''}
                </div>
              </div>
            </div>

            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs text-slate-600">
                {otpSent ? 'OTP sent to your WhatsApp number. Enter the 6-digit code to complete disbursement readiness.' : 'Sending OTP to your WhatsApp number...'}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">WhatsApp OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all tracking-[0.3em]"
                />
              </div>

              {otpError && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{otpError}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpLoading}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  Resend OTP
                </button>
                <button
                  type="submit"
                  disabled={otpLoading || otp.length !== 6}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
                >
                  {otpLoading ? 'Confirming...' : 'Confirm OTP'}
                </button>
              </div>
            </form>
          </motion.section>
        )}

        {step === 'ready' && readyResult && (
          <motion.section
            className="border border-green-200 bg-green-50 rounded-2xl p-6"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-green-500 text-white flex items-center justify-center text-lg">✓</div>
              <div>
                <h3 className="text-base font-bold text-green-800">Ready for disbursement review</h3>
                <p className="text-xs text-slate-500">{readyResult.message || 'Bank verified and linked for payout review.'}</p>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 p-3.5 text-sm text-slate-700">
              {releaseStatus?.release_authorized
                ? 'Your bank account has been verified and OTP-confirmed. This scholarship can now move into the next payout run without needing a second release.'
                : 'Your bank account has been verified and OTP-confirmed. GovBot will now surface this application as payout-ready in the dashboard flow.'}
            </div>

            <div className="flex gap-3 mt-5">
              {readyResult.confirmation_number ? (
                <Link
                  href={`/track/${readyResult.confirmation_number}`}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm text-center font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Track Application
                </Link>
              ) : (
                <button
                  onClick={resetForm}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm text-center font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Verify Another
                </button>
              )}
              <Link
                href="/dashboard"
                className="flex-1 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm text-center font-semibold rounded-xl shadow-md hover:-translate-y-0.5 transition-all"
              >
                View Dashboard
              </Link>
            </div>
          </motion.section>
        )}

        {/* Info */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">How Penny Drop Works</p>
          <p>We deposit ₹0.01 to your bank account via NPCI to verify it&apos;s active and belongs to you. This confirms the account holder name and ensures scholarship funds can be disbursed correctly.</p>
        </div>
      </div>
    </>
  );
}
