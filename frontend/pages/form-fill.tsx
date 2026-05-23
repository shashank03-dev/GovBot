import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Zap, CheckCircle, AlertCircle, ArrowLeft, ExternalLink,
  Clock, RefreshCw, ChevronRight, Globe, User
} from 'lucide-react';
import { buildProxyApiPath } from '@/lib/backendApi.mjs';

type FormField = {
  label: string;
  name: string;
  id: string;
  type: string;
  placeholder: string;
};

type AnalyzeResult = {
  url: string;
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
  { label: 'NSP Scholarship', url: 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction' },
  { label: 'PM Kisan', url: 'https://pmkisan.gov.in/RegistrationForm.aspx' },
  { label: 'Udyam Registration', url: 'https://udyamregistration.gov.in/Government-India/Ministry-MSME-registration.htm' },
];

export default function FormFillPage() {
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

  const fetchHistory = async (p: string) => {
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`form-scanner/history/${encodeURIComponent(p)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath('form-scanner/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Analysis failed');
      setAnalyzeResult(data);
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
      setStep('idle');
    }
  };

  const handleFill = async () => {
    if (!analyzeResult) return;
    setStep('filling');
    const mergedMap = { ...analyzeResult.field_map };
    Object.entries(overrides).forEach(([k, v]) => { if (v) mergedMap[k] = v; });
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath('form-scanner/fill'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: analyzeResult.url, phone, field_map: mergedMap, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Fill failed');
      setFillResult(data);
      setStep('done');
      if (phone) fetchHistory(phone);
    } catch (e: any) {
      setError(e.message || 'Fill failed');
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
                    <p className="text-xs text-slate-400 mt-0.5 break-all">{analyzeResult.url}</p>
                  </div>
                  <a href={analyzeResult.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-slate-500">
                    <ExternalLink size={14} />
                  </a>
                </div>

                {analyzeResult.message && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                    ⚠️ {analyzeResult.message}
                  </div>
                )}

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

                <button
                  onClick={handleFill}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm"
                >
                  <Zap size={16} /> Fill Form Now ({analyzeResult.filled_count} fields)
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
                    <img
                      src={`${API_BASE}/form-scanner/screenshot/${fillResult.screenshot_path}`}
                      alt="Filled form screenshot"
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
