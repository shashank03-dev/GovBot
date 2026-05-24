import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  GraduationCap, ChevronRight, ArrowLeft, Loader2,
  Smartphone, ShieldCheck, CheckCircle, MessageCircle,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errorMessage';

type Step = 'credentials' | 'otp' | 'success';

function formatAadhaar(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(' ')
  );
}

export default function DigiLockerInitPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('credentials');
  const [aadhaar, setAadhaar] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const aadhaarDigits = aadhaar.replace(/\s/g, '');
  const canSend = aadhaarDigits.length === 12 && phone.replace(/\D/g, '').length === 10;
  const canVerify = otp.replace(/\D/g, '').length === 6;

  const startResendTimer = () => {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(iv); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/digilocker/mock/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      setStep('otp');
      startResendTimer();
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to send OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/digilocker/mock/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), otp: otp.replace(/\D/g, '') }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Invalid or expired OTP');

      localStorage.setItem('digilocker_profile', JSON.stringify(data.profile));
      setStep('success');

      await new Promise((r) => setTimeout(r, 1200));
      const consentId = `mock_${Math.random().toString(36).slice(2, 10)}`;
      router.push(`/digilocker/callback?consent_id=${consentId}`);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>DigiLocker Login | GovBot</title>
        <meta name="description" content="Connect DigiLocker to auto-fetch your government documents." />
      </Head>

      <div className="min-h-screen gradient-hero flex flex-col">
        {/* Slim Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center shadow-md shadow-orange-200/50">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Gov<span className="text-[#ff9933]">Bot</span>
                </span>
              </Link>
              <nav className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400">
                <Link href="/services" className="hover:text-[#ff9933] transition-colors">Services</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-slate-600 font-medium">DigiLocker</span>
              </nav>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full">
            <Link
              href="/services"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Services
            </Link>

            {/* DigiLocker card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4">

              {/* DigiLocker brand header */}
              <div className="bg-[#003399] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-none">DigiLocker</p>
                    <p className="text-blue-200 text-xs mt-0.5">Ministry of Electronics & IT, Govt. of India</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {(['credentials', 'otp', 'success'] as Step[]).map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        step === s
                          ? 'bg-[#003399] text-white ring-4 ring-blue-100'
                          : (['credentials', 'otp', 'success'].indexOf(step) > i)
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-400'
                      }`}>
                        {(['credentials', 'otp', 'success'].indexOf(step) > i) ? '✓' : i + 1}
                      </div>
                      {i < 2 && <div className={`h-0.5 w-8 ${(['credentials', 'otp', 'success'].indexOf(step) > i) ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                    </div>
                  ))}
                </div>

                {/* ── Step 1: Credentials ── */}
                {step === 'credentials' && (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        Sign in to DigiLocker
                      </h2>
                      <p className="text-slate-500 text-xs">Enter your Aadhaar and mobile to receive OTP on WhatsApp</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Aadhaar Number
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={aadhaar}
                        onChange={(e) => setAadhaar(formatAadhaar(e.target.value))}
                        placeholder="XXXX XXXX XXXX"
                        maxLength={14}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] transition-all"
                      />
                      <p className="text-xs text-slate-400 mt-1">Enter your 12-digit Aadhaar number</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Mobile Number (WhatsApp)
                      </label>
                      <div className="flex gap-2">
                        <div className="flex items-center px-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 font-medium shrink-0">
                          +91
                        </div>
                        <input
                          type="tel"
                          inputMode="numeric"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="10-digit mobile"
                          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] transition-all"
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={!canSend || loading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                      {loading ? 'Sending OTP...' : 'Send OTP on WhatsApp'}
                    </button>

                  </form>
                )}

                {/* ── Step 2: OTP Verification ── */}
                {step === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        Enter OTP
                      </h2>
                      <p className="text-slate-500 text-xs">
                        Check your WhatsApp (+91 {phone.slice(0, 2)}XXXXXX{phone.slice(-2)}) for the 6-digit OTP
                      </p>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 bg-[#f0f4ff] border border-[#c7d4f8] rounded-xl">
                      <MessageCircle className="w-5 h-5 text-[#003399] shrink-0" />
                      <p className="text-xs text-[#003399] font-medium">
                        OTP sent to your WhatsApp. Valid for 10 minutes.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        6-digit OTP
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoFocus
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="• • • • • •"
                        maxLength={6}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xl font-mono tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] transition-all"
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={!canVerify || loading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {loading ? 'Verifying...' : 'Verify & Connect'}
                    </button>

                    <div className="text-center">
                      {resendTimer > 0 ? (
                        <p className="text-xs text-slate-400">Resend OTP in {resendTimer}s</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendOtp()}
                          className="text-xs text-[#003399] hover:underline font-medium"
                        >
                          Resend OTP
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => { setStep('credentials'); setOtp(''); setError(''); }}
                      className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
                    >
                      ← Change mobile number
                    </button>
                  </form>
                )}

                {/* ── Step 3: Success ── */}
                {step === 'success' && (
                  <div className="text-center py-4 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        Connected!
                      </h2>
                      <p className="text-slate-500 text-sm mt-1">Fetching your documents...</p>
                    </div>
                    <Loader2 className="w-5 h-5 animate-spin text-[#ff9933] mx-auto" />
                  </div>
                )}
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-400">Powered by DigiLocker • Government of India</p>
              <p className="text-xs text-slate-300 mt-1">Demo Mode — Mock Integration</p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
