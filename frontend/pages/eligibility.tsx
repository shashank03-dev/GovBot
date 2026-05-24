import { useState, useEffect } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import { getErrorMessage } from '@/lib/errorMessage';

interface EligibilityResult {
  eligible: boolean;
  schemes: string[];
  reasons: string[];
}

const SCHEME_ROUTES: Record<string, string> = {
  NSP: '/nsp',
  PMSS: '/pmss',
  CSSS: '/csss',
  Minority: '/minority',
};

const INCOME_OPTIONS = [
  { label: '< ₹1 Lakh',       value: 80000 },
  { label: '₹1L – ₹2.5L',     value: 175000 },
  { label: '₹2.5L – ₹4.5L',   value: 350000 },
  { label: '> ₹4.5 Lakh',      value: 500000 },
];

const CASTE_OPTIONS = ['SC', 'ST', 'OBC', 'General'] as const;
type Caste = typeof CASTE_OPTIONS[number];

const COURSE_OPTIONS = [
  { label: 'Pre Matric',  value: 'pre_matric' },
  { label: 'Post Matric', value: 'post_matric' },
  { label: 'Degree',      value: 'degree' },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < current
                ? 'bg-green-500 text-white'
                : i === current
                  ? 'bg-[#ff9933] text-white ring-4 ring-orange-200'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-8 ${i < current ? 'bg-green-500' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-4 px-6 rounded-xl border-2 text-sm font-semibold transition-all ${
        selected
          ? 'bg-[#ff9933] border-[#ff9933] text-white shadow-lg shadow-orange-200'
          : 'bg-white border-slate-200 text-slate-700 hover:border-[#ff9933] hover:text-[#ff9933]'
      }`}
    >
      {label}
    </button>
  );
}

export default function EligibilityPage() {
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState<number | null>(null);
  const [caste, setCaste] = useState<Caste | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [marks, setMarks] = useState<number>(60);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [error, setError] = useState('');

  const TOTAL_STEPS = 4;

  // Trigger confetti when user becomes eligible
  useEffect(() => {
    if (result?.eligible && step === TOTAL_STEPS) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          window.clearInterval(interval);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults, 
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
          ...defaults, 
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      return () => window.clearInterval(interval);
    }
  }, [result, step]);

  const canNext = () => {
    if (step === 0) return income !== null;
    if (step === 1) return caste !== null;
    if (step === 2) return course !== null;
    return true;
  };

  const handleNext = async () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
      return;
    }
    // Step 3 — submit
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildProxyApiPath('eligibility/screen'), buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income,
          caste,
          course_level: course,
          marks_pct: marks,
        }),
      }));
      if (!res.ok) throw new Error('Server error');
      const data: EligibilityResult = await res.json();
      setResult(data);
      setStep(TOTAL_STEPS);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Eligibility check failed — server unreachable. Please try again in a moment.'));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  const resetForm = () => {
    setStep(0);
    setIncome(null);
    setCaste(null);
    setCourse(null);
    setMarks(60);
    setResult(null);
    setError('');
  };

  return (
    <>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">

          {/* Result screen */}
          {step === TOTAL_STEPS && result ? (
            <div className="text-center">
              {result.eligible ? (
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-8 mb-6 shadow-sm">
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="text-2xl font-bold text-green-700 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>You&apos;re Eligible!</h2>
                  <p className="text-slate-500 text-sm mb-6">You qualify for these scholarships:</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {result.schemes.map(scheme => (
                      <Link
                        key={scheme}
                        href={SCHEME_ROUTES[scheme] || '/'}
                        className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold px-5 py-2 rounded-full text-sm transition-all shadow-md hover:-translate-y-0.5"
                      >
                        {scheme} →
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 mb-6 shadow-sm">
                  <div className="text-5xl mb-3">😔</div>
                  <h2 className="text-2xl font-bold text-red-700 mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>Not Eligible</h2>
                  <p className="text-slate-500 text-sm mb-4">Based on your inputs, you don&apos;t qualify right now.</p>
                </div>
              )}

              {/* Reasons */}
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-6 text-left shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Details</p>
                <ul className="space-y-2">
                  {result.reasons.filter(r => !r.startsWith('RAG')).map((r, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                      <span>{r.includes('✓') ? '✅' : '❌'}</span>
                      <span>{r.replace('✓', '').replace('✗', '').trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={resetForm}
                className="w-full bg-gradient-to-r from-[#ff9933] to-[#e67e00] hover:shadow-lg text-white font-semibold py-3 rounded-xl transition-all shadow-md"
              >
                Check Again
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-center mb-2 text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>Check Your Eligibility</h1>
              <p className="text-slate-500 text-sm text-center mb-8">
                Answer 4 quick questions to find which scholarships apply to you.
              </p>

              <StepIndicator current={step} total={TOTAL_STEPS} />

              {/* Step 0 — Income */}
              {step === 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-5 text-slate-900">Annual family income</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {INCOME_OPTIONS.map(opt => (
                      <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={income === opt.value}
                        onClick={() => setIncome(opt.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 1 — Caste */}
              {step === 1 && (
                <div>
                  <h2 className="text-lg font-semibold mb-5 text-slate-900">Category / Caste</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {CASTE_OPTIONS.map(c => (
                      <OptionButton
                        key={c}
                        label={c}
                        selected={caste === c}
                        onClick={() => setCaste(c)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2 — Course level */}
              {step === 2 && (
                <div>
                  <h2 className="text-lg font-semibold mb-5 text-slate-900">Course level</h2>
                  <div className="flex flex-col gap-3">
                    {COURSE_OPTIONS.map(opt => (
                      <OptionButton
                        key={opt.value}
                        label={opt.label}
                        selected={course === opt.value}
                        onClick={() => setCourse(opt.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3 — Marks */}
              {step === 3 && (
                <div>
                  <h2 className="text-lg font-semibold mb-2 text-slate-900">Marks % in last exam</h2>
                  <p className="text-slate-500 text-sm mb-6">Drag or type your percentage</p>
                  <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
                    <div className="text-5xl font-bold text-[#ff9933] text-center mb-4">
                      {marks}%
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={marks}
                      onChange={e => setMarks(Number(e.target.value))}
                      className="w-full accent-[#ff9933]"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>0%</span><span>100%</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={marks}
                      onChange={e => setMarks(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="mt-4 w-full bg-slate-50 border border-slate-200 text-slate-900 text-center rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all"
                      placeholder="Or type exact %"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-center">{error}</p>
              )}

              {/* Navigation */}
              <div className="flex gap-3 mt-8">
                {step > 0 && (
                  <button
                    onClick={handleBack}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={!canNext() || loading}
                  className={`flex-1 font-semibold py-3 rounded-xl transition-all ${
                    canNext() && !loading
                      ? 'bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white shadow-md hover:-translate-y-0.5'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Checking...
                    </span>
                  ) : step === TOTAL_STEPS - 1 ? 'Check Eligibility →' : 'Next →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
