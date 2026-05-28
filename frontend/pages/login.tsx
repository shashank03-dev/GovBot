import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Smartphone, ArrowRight, ShieldCheck, GraduationCap } from 'lucide-react';

import { CITIZEN_SESSION_SENTINEL, CITIZEN_SESSION_STORAGE_KEY } from '@/lib/authSession.mjs';
import { LOGIN_HIGHLIGHTS } from '@/lib/siteFeatureContent.mjs';
import { DEFAULT_POST_LOGIN_PATH, sanitizePostLoginPath } from '@/lib/navigationLinks.mjs';
import { normalizeIndianPhone } from '@/lib/phoneStorage.mjs';

export default function Login() {
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [redirectPath, setRedirectPath] = useState(DEFAULT_POST_LOGIN_PATH);
  const router = useRouter();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 2 && resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, resendTimer]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextPath = sanitizePostLoginPath(params.get('next') || DEFAULT_POST_LOGIN_PATH);
    const handoffCode = params.get('handoff');
    setRedirectPath(nextPath);

    const storedToken = localStorage.getItem(CITIZEN_SESSION_STORAGE_KEY);
    const storedPhone = localStorage.getItem('govbot_phone') || '';
    const canonicalStoredPhone = normalizeIndianPhone(storedPhone);
    if (storedPhone && canonicalStoredPhone && canonicalStoredPhone !== storedPhone) {
      localStorage.setItem('govbot_phone', canonicalStoredPhone);
    }

    if (handoffCode) {
      setLoading(true);
      void fetch('/api/auth/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: handoffCode }),
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload?.valid || !payload?.phone) {
            throw new Error(payload?.detail || payload?.error || 'This login link is invalid or expired.');
          }

          const verifiedPhone = normalizeIndianPhone(payload.phone) || payload.phone;
          localStorage.setItem(CITIZEN_SESSION_STORAGE_KEY, CITIZEN_SESSION_SENTINEL);
          localStorage.setItem('govbot_phone', verifiedPhone);
          void router.replace(sanitizePostLoginPath(payload.next_path || nextPath));
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'This login link is invalid or expired.');
        })
        .finally(() => setLoading(false));
      return;
    }

    if (storedToken && (canonicalStoredPhone || storedPhone)) {
      router.replace(nextPath);
    }
  }, [router]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    const canonicalPhone = normalizeIndianPhone(phone) || phone.trim();

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone })
      });

      if (!res.ok) {
        throw new Error('Failed to send OTP. Please try again.');
      }

      setStep(2);
      setResendTimer(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Check your phone number and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const canonicalPhone = normalizeIndianPhone(phone) || phone.trim();
    const normalizedOtp = otp.replace(/\s/g, '');

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone, code: normalizedOtp }),
      });

      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.error || 'Invalid OTP. Please try again.');
      }

      const verifiedPhone = normalizeIndianPhone(data.phone || canonicalPhone);
      localStorage.setItem(CITIZEN_SESSION_STORAGE_KEY, CITIZEN_SESSION_SENTINEL);
      localStorage.setItem('govbot_phone', verifiedPhone);

      router.push(redirectPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login | GovBot - AI-Powered Scholarship Assistant</title>
        <meta name="description" content="Login to GovBot to track your scholarship applications, check eligibility, and manage your credentials securely." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        {/* Soft gradient background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-50/80 via-white to-teal-50/50" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-100/40 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200/50">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Welcome to GovBot
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">
                {step === 1 ? 'Sign in with your WhatsApp number' : 'Enter the OTP sent to your WhatsApp'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-6">
              {LOGIN_HIGHLIGHTS.map((item, i) => (
                <motion.div
                  key={item.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.12 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={prefersReducedMotion ? undefined : { x: 3, backgroundColor: '#fff7ed' }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#e67e00]">{item.title}</div>
                  <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                </motion.div>
              ))}
            </div>

            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                {error}
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 XXXXXXXXXX"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !phone}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all text-sm"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Send OTP via WhatsApp
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-slate-700 mb-1.5">
                    6-Digit OTP
                  </label>
                  <input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
                    placeholder="• • • • • •"
                    maxLength={6}
                    className="w-full py-3.5 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-center text-xl tracking-[0.5em] font-semibold placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all"
                    disabled={loading}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all text-sm"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Verify OTP
                    </>
                  )}
                </button>

                <div className="text-center pt-1">
                  {resendTimer > 0 ? (
                    <span className="text-xs text-slate-400">
                      Resend available in {resendTimer}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleSendOtp(e)}
                      disabled={loading}
                      className="text-xs text-[#ff9933] hover:text-[#e67e00] font-medium transition-colors"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          {/* Quick links below card */}
          <div className="mt-6 flex flex-col items-center gap-2.5 text-sm">
            <Link href="/eligibility" className="text-slate-500 hover:text-[#ff9933] transition-colors">
              Check Eligibility (no login needed)
            </Link>
            <Link href="/track-search" className="text-slate-500 hover:text-[#ff9933] transition-colors">
              Track Application Status
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  );
}
