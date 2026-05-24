import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AlertCircle, ArrowRight, CheckCircle2, FileText, GraduationCap, Loader2 } from 'lucide-react';

type ReviewDocument = {
  name: string;
  doc_type?: string;
};

type ReviewSession = {
  review_session_id: string;
  portal: string;
  portal_label: string;
  documents: ReviewDocument[];
  imported_fields: Record<string, string | number>;
  missing_fields: string[];
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const PRETTY_FIELD_LABELS: Record<string, string> = {
  name: 'Full name',
  dob: 'Date of birth',
  gender: 'Gender',
  aadhaar_number: 'Aadhaar',
  income: 'Annual family income',
  caste: 'Caste',
  category: 'Category',
  marks_pct: 'Previous year marks',
  address: 'Address',
};

export default function DigiLockerReviewPage() {
  const router = useRouter();
  const { sessionId } = router.query;

  const [review, setReview] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'use' | 'edit' | 'save' | null>(null);
  const [error, setError] = useState('');

  const phone = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('govbot_phone') || '';
  }, []);

  useEffect(() => {
    if (!router.isReady || typeof sessionId !== 'string' || !phone) return;

    let cancelled = false;
    const loadReview = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/digilocker/review/${encodeURIComponent(sessionId)}?phone=${encodeURIComponent(phone)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to load DigiLocker review');
        if (!cancelled) setReview(data);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load DigiLocker review'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReview();
    return () => { cancelled = true; };
  }, [router.isReady, sessionId, phone]);

  const submitDecision = async (decision: 'use' | 'edit' | 'save') => {
    if (!review || !phone || typeof sessionId !== 'string') return;
    setSubmitting(decision);
    setError('');
    try {
      const res = await fetch(`/api/digilocker/review/${encodeURIComponent(sessionId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to apply review decision');
      await router.push(data.next_url);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to apply review decision'));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      <Head>
        <title>DigiLocker Review | GovBot</title>
      </Head>

      <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center shadow-md shadow-orange-200/50">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">GovBot review hub</p>
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Review DigiLocker data before continuing
              </h1>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
              <Loader2 className="w-5 h-5 animate-spin text-[#ff9933] mx-auto" />
              <p className="text-sm text-slate-500 mt-4">Loading your DigiLocker review...</p>
            </div>
          ) : error ? (
            <div className="bg-white border border-red-100 rounded-3xl p-10 shadow-sm text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
              <p className="text-sm text-red-600 mt-4">{error}</p>
              <Link
                href="/digilocker"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
              >
                Restart DigiLocker
              </Link>
            </div>
          ) : review ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Ready for {review.portal_label}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    Confirm what GovBot imported from DigiLocker
                  </h2>
                  <p className="text-sm text-slate-500 mt-2">
                    This checkpoint keeps the flow production-shaped: you can review what came back before any portal auto-fill or continuation starts.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <h3 className="text-sm font-semibold text-slate-800">Documents shared</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {review.documents.map(doc => (
                        <span key={doc.name} className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700">
                          {doc.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Imported fields</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(review.imported_fields).map(([key, value]) => (
                        <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                            {PRETTY_FIELD_LABELS[key] || key.replace(/_/g, ' ')}
                          </div>
                          <div className="text-sm font-medium text-slate-800 mt-1">
                            {String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-800">Still missing for the next step</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    GovBot will only ask for these after you decide how to continue.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {review.missing_fields.length > 0 ? review.missing_fields.map(field => (
                      <span key={field} className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                        {PRETTY_FIELD_LABELS[field] || field.replace(/_/g, ' ')}
                      </span>
                    )) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                        No required fields missing
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 space-y-3">
                  <button
                    onClick={() => submitDecision('use')}
                    disabled={submitting !== null}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 transition-all disabled:opacity-60"
                  >
                    {submitting === 'use' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Use for {review.portal_label}
                  </button>
                  <button
                    onClick={() => submitDecision('edit')}
                    disabled={submitting !== null}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                  >
                    {submitting === 'edit' ? 'Opening profile...' : 'Edit details first'}
                  </button>
                  <button
                    onClick={() => submitDecision('save')}
                    disabled={submitting !== null}
                    className="w-full rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-60"
                  >
                    {submitting === 'save' ? 'Saving...' : 'Save to profile only'}
                  </button>
                  {error && (
                    <p className="text-sm text-red-600 pt-2">{error}</p>
                  )}
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
