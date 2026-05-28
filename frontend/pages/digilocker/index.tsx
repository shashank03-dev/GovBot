import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { CITIZEN_SESSION_SENTINEL, CITIZEN_SESSION_STORAGE_KEY } from '@/lib/authSession.mjs';
import { normalizeIndianPhone, toLocalTenDigitPhone } from '@/lib/phoneStorage.mjs';

type Step = 'credentials' | 'otp' | 'success';

type PortalConfig = {
  portal: string;
  label: string;
  required_docs: string[];
  optional_docs: string[];
  next_url: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const DOC_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  income_certificate: 'Income Certificate',
  caste_certificate: 'Caste Certificate',
  marksheet: 'Previous Year Marksheet',
};

function formatAadhaar(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(' ')
  );
}

export default function DigiLockerInitPage() {
  const router = useRouter();
  const portalId = typeof router.query.portal === 'string' ? router.query.portal : 'profile';

  const [step, setStep] = useState<Step>('credentials');
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [aadhaar, setAadhaar] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [selectedOptionalDocs, setSelectedOptionalDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    const storedPhone = typeof window !== 'undefined' ? localStorage.getItem('govbot_phone') || '' : '';
    if (storedPhone) {
      setPhone(toLocalTenDigitPhone(storedPhone));
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;
    const loadConfig = async () => {
      setConfigLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/digilocker/portal-config/${encodeURIComponent(portalId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to load DigiLocker flow');
        if (cancelled) return;
        setConfig(data);
        setSelectedOptionalDocs(data.optional_docs || []);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load DigiLocker flow'));
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };

    loadConfig();
    return () => { cancelled = true; };
  }, [router.isReady, portalId]);

  const aadhaarDigits = aadhaar.replace(/\s/g, '');
  const canSend = aadhaarDigits.length === 12 && phone.replace(/\D/g, '').length === 10;
  const canVerify = otp.replace(/\D/g, '').length === 6;

  const destinationLabel = config?.label || 'your destination';
  const selectedScope = useMemo(
    () => [...(config?.required_docs || []), ...selectedOptionalDocs],
    [config, selectedOptionalDocs],
  );

  const startResendTimer = () => {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(iv); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const toggleOptionalDoc = (doc: string) => {
    setSelectedOptionalDocs(prev => (
      prev.includes(doc)
        ? prev.filter(item => item !== doc)
        : [...prev, doc]
    ));
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const canonicalPhone = normalizeIndianPhone(phone);
      const res = await fetch('/api/digilocker/mock/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || 'Failed to send OTP');
      setStep('otp');
      startResendTimer();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to send OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!config) return;

    setError('');
    setLoading(true);
    try {
      const canonicalPhone = normalizeIndianPhone(
        (typeof window !== 'undefined' ? localStorage.getItem('govbot_phone') || '' : '') || phone,
      );
      const verifyRes = await fetch('/api/digilocker/mock/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: canonicalPhone,
          otp: otp.replace(/\D/g, ''),
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.error || 'Invalid or expired OTP');

      const verifiedPhone = normalizeIndianPhone(verifyData.phone || canonicalPhone);
      localStorage.setItem(CITIZEN_SESSION_STORAGE_KEY, CITIZEN_SESSION_SENTINEL);
      localStorage.setItem('govbot_phone', verifiedPhone);
      setStep('success');

      const consentRes = await fetch('/api/digilocker/mock/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: verifiedPhone,
          portal: config.portal,
          channel: 'web',
          return_to: config.next_url,
          selected_optional_docs: selectedOptionalDocs,
        }),
      });
      const consentData = await consentRes.json();
      if (!consentRes.ok) throw new Error(consentData.detail || 'Failed to start DigiLocker consent');

      await new Promise(resolve => setTimeout(resolve, 1200));
      router.push(consentData.redirect_url);
    } catch (err: unknown) {
      setStep('otp');
      setError(getErrorMessage(err, 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>DigiLocker Connect | GovBot</title>
        <meta name="description" content="Prepare and connect DigiLocker for portal-aware document sharing." />
      </Head>

      <div className="min-h-screen gradient-hero flex flex-col">
        <header className="sticky top-0 z-50 bg-white/90 border-b border-slate-200/70">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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

        <main className="flex-1 px-4 py-10">
          <div className="max-w-5xl mx-auto">
            <Link
              href={portalId === 'profile' ? '/profile' : '/services'}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-semibold">
                    DigiLocker review-first flow
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 mt-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    Prepare document sharing for {destinationLabel}
                  </h1>
                  <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                    GovBot will show you what is required for this portal, then send you through DigiLocker and bring you back for a confirmation review before any auto-fill happens.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Required for {destinationLabel}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(config?.required_docs || []).map(doc => (
                          <span key={doc} className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700">
                            {DOC_LABELS[doc] || doc}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Selected for review</p>
                      <p className="text-sm text-slate-500 mt-2">
                        {selectedScope.length} document{selectedScope.length === 1 ? '' : 's'} will be requested from DigiLocker.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedScope.map(doc => (
                          <span key={doc} className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
                            {DOC_LABELS[doc] || doc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">Optional documents</p>
                    <p className="text-sm text-slate-500 mt-1">Deselect any optional documents you do not want GovBot to ask for in this run. Final sharing still happens inside DigiLocker.</p>
                    <div className="mt-4 space-y-3">
                      {(config?.optional_docs || []).map(doc => {
                        const active = selectedOptionalDocs.includes(doc);
                        return (
                          <label
                            key={doc}
                            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${active ? 'border-orange-200 bg-orange-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleOptionalDoc(doc)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#ff9933] focus:ring-[#ff9933]"
                            />
                            <div>
                              <div className="text-sm font-semibold text-slate-800">{DOC_LABELS[doc] || doc}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Shared only for this review and portal continuation.
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      {config && config.optional_docs.length === 0 && (
                        <p className="text-sm text-slate-500">No optional documents for this portal flow.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-[#003399] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">DigiLocker</p>
                      <p className="text-blue-100 text-xs mt-0.5">Ministry of Electronics & IT, Govt. of India</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    {(['credentials', 'otp', 'success'] as Step[]).map((currentStep, index) => (
                      <div key={currentStep} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          step === currentStep
                            ? 'bg-[#003399] text-white ring-4 ring-blue-100'
                            : (['credentials', 'otp', 'success'].indexOf(step) > index)
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-100 text-slate-400'
                        }`}>
                          {(['credentials', 'otp', 'success'].indexOf(step) > index) ? '✓' : index + 1}
                        </div>
                        {index < 2 && <div className={`h-0.5 w-8 ${(['credentials', 'otp', 'success'].indexOf(step) > index) ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                      </div>
                    ))}
                  </div>

                  {configLoading ? (
                    <div className="py-14 flex flex-col items-center gap-3 text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-[#ff9933]" />
                      <p className="text-sm">Loading DigiLocker portal rules...</p>
                    </div>
                  ) : step === 'credentials' ? (
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          Sign in to DigiLocker
                        </h2>
                        <p className="text-slate-500 text-xs">Authenticate to fetch the selected documents for {destinationLabel}.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Aadhaar Number</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={aadhaar}
                          onChange={(e) => setAadhaar(formatAadhaar(e.target.value))}
                          placeholder="XXXX XXXX XXXX"
                          maxLength={14}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#003399]/20 focus:border-[#003399] transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile Number (WhatsApp)</label>
                        <div className="flex gap-2">
                          <div className="flex items-center px-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 font-medium shrink-0">+91</div>
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
                  ) : step === 'otp' ? (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          Confirm your DigiLocker OTP
                        </h2>
                        <p className="text-slate-500 text-xs">
                          After verification, GovBot will create a portal-specific share request and send you to the DigiLocker callback step.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-[#003399]">
                        OTP sent to your WhatsApp number. The selected document set will be reviewed inside GovBot before any portal action begins.
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">6-digit OTP</label>
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
                        {loading ? 'Creating review flow...' : 'Verify and continue'}
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
                    </form>
                  ) : (
                    <div className="text-center py-6 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          Creating your DigiLocker review
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">GovBot is preparing a portal-aware callback and review checkpoint.</p>
                      </div>
                      <Loader2 className="w-5 h-5 animate-spin text-[#ff9933] mx-auto" />
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
