import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { CheckCircle, Clock, FileText, GraduationCap, Link as LinkIcon, XCircle } from 'lucide-react';

type CallbackState = 'loading' | 'processing' | 'success' | 'error';

type CallbackResponse = {
  status?: string;
  documents?: Array<{ name: string }>;
  review_url?: string;
  detail?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function DigiLockerCallback() {
  const router = useRouter();
  const { consent_id } = router.query;

  const [status, setStatus] = useState<CallbackState>('loading');
  const [progress, setProgress] = useState(0);
  const [documents, setDocuments] = useState<string[]>([]);
  const [nextUrl, setNextUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady || typeof consent_id !== 'string' || !consent_id) return;

    let cancelled = false;
    const processCallback = async () => {
      try {
        setStatus('processing');
        setProgress(20);
        await new Promise(resolve => setTimeout(resolve, 600));

        const response = await fetch(`/api/digilocker/mock/callback?consent_id=${encodeURIComponent(consent_id)}&action=approve`);
        const data: CallbackResponse = await response.json();
        if (!response.ok || data.status !== 'success') {
          throw new Error(data.detail || 'Failed to complete DigiLocker callback');
        }

        if (cancelled) return;
        setProgress(70);
        setDocuments((data.documents || []).map(item => item.name));
        setNextUrl(data.review_url || '');

        await new Promise(resolve => setTimeout(resolve, 800));
        if (cancelled) return;
        setProgress(100);
        setStatus('success');

        if (data.review_url) {
          setTimeout(() => {
            router.push(data.review_url as string);
          }, 1500);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatus('error');
          setError(getErrorMessage(err, 'Failed to complete DigiLocker callback'));
        }
      }
    };

    processCallback();
    return () => { cancelled = true; };
  }, [router, consent_id]);

  if (!router.isReady) return null;

  if (typeof consent_id !== 'string' || !consent_id) {
    return (
      <>
        <Head>
          <title>DigiLocker Authorization | GovBot</title>
        </Head>
        <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm">
            <XCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-2xl font-bold text-slate-900 mt-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              No active DigiLocker session
            </h1>
            <p className="text-sm text-slate-500 mt-3">
              Start the flow from GovBot so the callback can return to the correct review step.
            </p>
            <Link
              href="/digilocker"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
            >
              Restart DigiLocker
            </Link>
          </div>
        </div>
      </>
    );
  }

  const icon = {
    loading: <LinkIcon className="w-8 h-8 text-[#ff9933]" />,
    processing: <Clock className="w-8 h-8 text-[#0d9488] animate-pulse" />,
    success: <CheckCircle className="w-8 h-8 text-emerald-500" />,
    error: <XCircle className="w-8 h-8 text-red-500" />,
  }[status];

  const message = {
    loading: 'Initializing DigiLocker callback...',
    processing: 'Fetching the approved documents and building your GovBot review.',
    success: 'Documents received. Redirecting to your GovBot review screen...',
    error: error || 'Failed to connect DigiLocker. Please try again.',
  }[status];

  return (
    <>
      <Head>
        <title>DigiLocker Authorization | GovBot</title>
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
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 border-2 bg-white border-slate-200 shadow-sm">
                {icon}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                DigiLocker Authorization
              </h1>
              <p className="text-slate-500">
                Secure government document access
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                <span className="text-sm font-mono font-semibold text-slate-700">{progress}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #ff9933 0%, #e67e00 100%)' }}
                />
              </div>
              <p className="text-sm text-slate-700">{message}</p>
            </div>

            {documents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-[#0d9488]" />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Documents received</h2>
                </div>
                <ul className="space-y-3">
                  {documents.map(doc => (
                    <li key={doc} className="flex items-center gap-3 text-sm text-slate-700">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">✓</span>
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center mt-6">
                <p className="text-sm text-slate-500">
                  GovBot is taking you to a review checkpoint before any portal auto-fill starts.
                </p>
                {nextUrl && (
                  <button
                    onClick={() => router.push(nextUrl)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
                  >
                    Open review now
                  </button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
