import { useState, useEffect } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Zap, CheckCircle, AlertCircle, ArrowLeft, ExternalLink,
  RefreshCw, ChevronRight, Globe, User
} from 'lucide-react';
import {
  buildBackendRequestInit,
  buildFormScannerScreenshotApiPath,
  buildProxyApiPath,
} from '@/lib/backendApi.mjs';
import { buildDemoAliasAnalysis, findFormFillTarget, FORM_FILL_SAMPLE_TARGETS } from '@/lib/formFillTargets.mjs';
import { NSP_DEMO_SESSION_STORAGE_KEY } from '@/lib/nspDemoAutofill.mjs';
import { getErrorMessage } from '@/lib/errorMessage';

type FormField = {
  label: string;
  name: string;
  id: string;
  type: string;
  placeholder: string;
};

type AnalyzeResult = {
  url: string;
  display_url?: string;
  resolved_url?: string;
  resolution_mode?: 'demo_alias' | 'live_site';
  target_key?: string;
  target_label?: string;
  analyzed_page_label?: string;
  proof_note?: string;
  form_fields: FormField[];
  field_map: Record<string, string>;
  fill_values: Record<string, string>;
  filled_count: number;
  missing_fields: string[];
  profile_completeness?: number;
  message?: string;
};

type FillResult = {
  session_id: string;
  url: string;
  filled_count: number;
  missing_fields: string[];
  screenshot_path?: string;
  status: string;
};

type HistorySession = {
  id: string;
  url: string;
  filled_count: number;
  missing_fields: string[];
  status: string;
  created_at: string;
};

const EXAMPLE_URLS = [
  ...FORM_FILL_SAMPLE_TARGETS.map(({ label, displayUrl }) => ({ label, url: displayUrl })),
  { label: 'PM Kisan', url: 'https://pmkisan.gov.in/RegistrationForm.aspx' },
  { label: 'Udyam Registration', url: 'https://udyamregistration.gov.in/Government-India/Ministry-MSME-registration.htm' },
];

export default function FormFillPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [url, setUrl] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'idle' | 'analyzing' | 'review' | 'filling' | 'done'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const p = localStorage.getItem('govbot_phone') || '';
    setPhone(p);
    if (p) fetchHistory(p);
  }, []);

  const fetchProfile = async (p: string) => {
    const token = localStorage.getItem('govbot_token');
    const res = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(p)}`), buildBackendRequestInit({
      headers: { Authorization: `Bearer ${token}` },
    }));
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not load your profile');
    return data.profile || {};
  };

  const fetchHistory = async (p: string) => {
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`form-scanner/history/${encodeURIComponent(p)}`), buildBackendRequestInit({
        headers: { Authorization: `Bearer ${token}` },
      }));
      if (res.ok) {
        const d = await res.json();
        setHistory(d.sessions || []);
      }
    } catch { /* ignore */ }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    if (!url.startsWith('http')) { setError('Please enter a valid URL starting with http://'); return; }
    if (!phone) { setError('Please log in first'); return; }
    setError('');
    setStep('analyzing');
    setAnalyzeResult(null);
    setFillResult(null);
    try {
      const normalizedUrl = url.trim();
      const target = findFormFillTarget(normalizedUrl);

      if (target?.mode === 'demo_alias') {
        const profile = await fetchProfile(phone);
        const rawData = buildDemoAliasAnalysis(target, profile, window.location.origin) as Record<string, unknown>;
        const data: AnalyzeResult = {
          url: String(rawData.url || normalizedUrl),
          display_url: rawData.display_url ? String(rawData.display_url) : undefined,
          resolved_url: rawData.resolved_url ? String(rawData.resolved_url) : undefined,
          resolution_mode: 'demo_alias',
          target_key: rawData.target_key ? String(rawData.target_key) : undefined,
          target_label: rawData.target_label ? String(rawData.target_label) : undefined,
          analyzed_page_label: rawData.analyzed_page_label ? String(rawData.analyzed_page_label) : undefined,
          proof_note: rawData.proof_note ? String(rawData.proof_note) : undefined,
          form_fields: Array.isArray(rawData.form_fields) ? rawData.form_fields as FormField[] : [],
          field_map: rawData.field_map && typeof rawData.field_map === 'object' ? { ...(rawData.field_map as Record<string, string>) } : {},
          fill_values: rawData.fill_values && typeof rawData.fill_values === 'object' ? { ...(rawData.fill_values as Record<string, string>) } : {},
          filled_count: Number(rawData.filled_count || 0),
          missing_fields: Array.isArray(rawData.missing_fields) ? rawData.missing_fields as string[] : [],
          profile_completeness: typeof rawData.profile_completeness === 'number' ? rawData.profile_completeness : undefined,
          message: rawData.message ? String(rawData.message) : undefined,
        };
        setAnalyzeResult(data);
        setStep('review');
        return;
      }

      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath('form-scanner/analyze'), buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: normalizedUrl, phone }),
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Analysis failed');
      setAnalyzeResult({
        ...data,
        display_url: normalizedUrl,
        resolved_url: data.url || normalizedUrl,
        resolution_mode: 'live_site' as const,
        target_key: target?.key,
        target_label: target?.label,
        analyzed_page_label: target?.analyzedPageLabel || 'Live analyzed page',
        proof_note: target?.proofNote,
      });
      setStep('review');
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Analysis failed'));
      setStep('idle');
    }
  };

  const handleFill = async () => {
    if (!analyzeResult) return;

    if (analyzeResult.resolution_mode === 'demo_alias' && analyzeResult.resolved_url) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          NSP_DEMO_SESSION_STORAGE_KEY,
          JSON.stringify(analyzeResult.fill_values || {}),
        );
      }
      void router.push(analyzeResult.resolved_url);
      return;
    }

    setStep('filling');
    const mergedMap = { ...analyzeResult.field_map };
    Object.entries(overrides).forEach(([k, v]) => { if (v) mergedMap[k] = v; });
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath('form-scanner/fill'), buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: analyzeResult.url, phone, field_map: mergedMap, confirm: true }),
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Fill failed');
      setFillResult(data);
      setStep('done');
      if (phone) fetchHistory(phone);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Fill failed'));
      setStep('review');
    }
  };

  const reset = () => {
    setUrl('');
    setAnalyzeResult(null);
    setFillResult(null);
    setOverrides({});
    setStep('idle');
    setError('');
  };

  const isDemoAlias = analyzeResult?.resolution_mode === 'demo_alias';
  const primaryCtaLabel = isDemoAlias
    ? 'Open Demo Form & Fill Fast'
    : `Preview Fill (No Submit)${analyzeResult ? ` (${analyzeResult.filled_count} fields)` : ''}`;

  return (
    <>
      <Head>
        <title>Auto-Fill Any Form | GovBot</title>
        <meta name="description" content="Paste any government portal URL — GovBot fills the form from your citizen profile automatically." />
      </Head>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Auto-Fill Any Form
              </h1>
              <p className="text-xs text-slate-400">Paste a government portal URL → GovBot fills it from your profile</p>
            </div>
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              <User size={13} /> My Profile
            </Link>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

          {/* URL Input card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <label className="block text-xs font-semibold text-slate-600 mb-2">Government Portal URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                  placeholder="https://scholarships.gov.in/..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition text-slate-800 placeholder-slate-300"
                  onKeyDown={e => e.key === 'Enter' && step === 'idle' && handleAnalyze()}
                />
              </div>
              <button
                onClick={step === 'idle' ? handleAnalyze : reset}
                disabled={step === 'analyzing' || step === 'filling'}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {step === 'analyzing' ? (
                  <><RefreshCw size={14} className="animate-spin" /> Analyzing…</>
                ) : step === 'filling' ? (
                  <><RefreshCw size={14} className="animate-spin" /> Filling…</>
                ) : step === 'done' ? (
                  <><RefreshCw size={14} /> New Form</>
                ) : (
                  <><Search size={14} /> Analyze</>
                )}
              </button>
            </div>

            {/* Example URLs */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs text-slate-400">Try:</span>
              {EXAMPLE_URLS.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => { setUrl(ex.url); setError(''); }}
                  className="text-xs text-orange-500 hover:text-orange-700 font-medium transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </p>
            )}
          </div>

          {/* Analysis result + review */}
          <AnimatePresence>
            {analyzeResult && step === 'review' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Form Analysis</h2>
                    <div className="mt-1 space-y-1 text-xs">
                      <p className="text-slate-400 break-all">
                        <span className="font-semibold text-slate-500">Displayed URL:</span> {analyzeResult.display_url || analyzeResult.url}
                      </p>
                      <p className="text-slate-400 break-all">
                        <span className="font-semibold text-slate-500">Analyzed page:</span> {analyzeResult.resolved_url || analyzeResult.url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {analyzeResult.resolution_mode && (
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${isDemoAlias ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isDemoAlias ? 'Demo alias' : 'Live site'}
                      </span>
                    )}
                    <a href={analyzeResult.display_url || analyzeResult.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-slate-500">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>

                {(analyzeResult.proof_note || analyzeResult.message) && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                    {analyzeResult.proof_note && (
                      <p>Proof: {analyzeResult.proof_note}</p>
                    )}
                    {analyzeResult.message && (
                      <p>Warning: {analyzeResult.message}</p>
                    )}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Target</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{analyzeResult.target_label || 'Custom URL'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Analyzer</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{analyzeResult.analyzed_page_label || 'Live analyzed page'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Action</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{isDemoAlias ? 'Open local demo + auto-fill' : 'Live fill preview only'}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Fields Found', value: analyzeResult.form_fields.length, color: '#3b82f6' },
                    { label: 'Auto-Filled', value: analyzeResult.filled_count, color: '#10b981' },
                    { label: 'Missing', value: analyzeResult.missing_fields.length, color: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} className="text-center p-3 bg-slate-50 rounded-xl">
                      <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Field mapping table */}
                {Object.keys(analyzeResult.field_map).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-600 mb-2">Field Mapping</h3>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {Object.entries(analyzeResult.field_map).map(([formField, profileKey]) => {
                        const val = analyzeResult.fill_values[formField];
                        const missing = !val;
                        return (
                          <div key={formField} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${missing ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-500 font-mono">{formField}</span>
                              <span className="text-slate-300 mx-1.5">→</span>
                              <span className="font-semibold text-slate-700">{profileKey.replace(/_/g, ' ')}</span>
                            </div>
                            {missing ? (
                              <input
                                type="text"
                                placeholder={`Enter ${profileKey.replace(/_/g, ' ')}`}
                                value={overrides[profileKey] || ''}
                                onChange={e => setOverrides(prev => ({ ...prev, [profileKey]: e.target.value }))}
                                className="w-32 px-2 py-1 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                              />
                            ) : (
                              <span className="text-emerald-600 font-medium truncate max-w-24">{val}</span>
                            )}
                            {missing ? <AlertCircle size={12} className="text-amber-400 flex-shrink-0" /> : <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Missing fields */}
                {analyzeResult.missing_fields.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1.5">
                      ⚠️ {analyzeResult.missing_fields.length} profile fields missing — fill below or <Link href="/profile" className="underline">complete your profile</Link>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {analyzeResult.missing_fields.map(f => (
                        <span key={f} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[11px] font-medium">
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isDemoAlias && analyzeResult.resolved_url && (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={analyzeResult.display_url || analyzeResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Open Official URL <ExternalLink size={12} />
                    </a>
                    <a
                      href={analyzeResult.resolved_url}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
                    >
                      Open Demo Form <ChevronRight size={12} />
                    </a>
                  </div>
                )}

                <button
                  onClick={handleFill}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm"
                >
                  <Zap size={16} /> {primaryCtaLabel}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fill result */}
          <AnimatePresence>
            {fillResult && step === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Form Filled Successfully!</h2>
                    <p className="text-xs text-slate-400">{fillResult.filled_count} fields auto-filled from your profile</p>
                  </div>
                </div>

                {fillResult.screenshot_path && (
                  <div className="rounded-xl overflow-hidden border border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 px-3 py-2 bg-slate-50 border-b border-slate-100">
                      📸 Form Screenshot
                    </p>
                    <Image
                      src={buildFormScannerScreenshotApiPath(fillResult.screenshot_path)}
                      alt="Filled form screenshot"
                      width={1200}
                      height={900}
                      unoptimized
                      className="w-full max-h-80 object-top object-cover"
                    />
                  </div>
                )}

                {fillResult.missing_fields.length > 0 && (
                  <div className="bg-amber-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Still needs manual input:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fillResult.missing_fields.map(f => (
                        <span key={f} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[11px]">
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={reset} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                    Fill Another Form
                  </button>
                  <Link href="/profile" className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-50 text-orange-600 text-sm font-semibold rounded-xl hover:bg-orange-100 transition-colors">
                    Complete Profile <ChevronRight size={14} />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-3">Recent Auto-Fills</h2>
              <div className="space-y-2">
                {history.map(session => (
                  <div key={session.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.status === 'filled' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{session.url}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {session.filled_count} fields filled · {new Date(session.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${session.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {session.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-4">How It Works</h2>
            <div className="space-y-3">
              {[
                { step: '1', title: 'Paste any government form URL', desc: 'Works with NSP, PM Kisan, Udyam, and hundreds more portals', color: '#ff9933' },
                { step: '2', title: 'Gemini maps form fields to your profile', desc: 'AI reads all input labels and matches them to your saved citizen data', color: '#3b82f6' },
                { step: '3', title: 'Playwright fills the form automatically', desc: 'Each field is filled with your verified data — no typing needed', color: '#10b981' },
                { step: '4', title: 'Screenshot proof + gap list', desc: 'See exactly what was filled and what needs manual attention', color: '#8b5cf6' },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: item.color }}>
                    {item.step}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
