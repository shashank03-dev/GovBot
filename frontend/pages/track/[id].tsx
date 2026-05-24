import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { buildApplicationTimelineApiPath, buildBackendRequestInit } from '@/lib/backendApi.mjs';
import { buildDashboardLoginHref, TRACK_SEARCH_HREF } from '@/lib/navigationLinks.mjs';

interface TimelineStep {
  step: string;
  icon: string;
  date: string | null;
  est_date: string | null;
  done: boolean;
}

interface AppData {
  confirmation_number: string;
  service: string;
  status: string;
  portal: string;
  submitted_at: string;
  timeline_steps: TimelineStep[];
}

const DEFAULT_STEPS: TimelineStep[] = [
  { step: 'Applied',      icon: '📝', date: null, est_date: null, done: false },
  { step: 'Under Review', icon: '🔍', date: null, est_date: null, done: false },
  { step: 'Approved',     icon: '✅', date: null, est_date: null, done: false },
  { step: 'Disbursed',    icon: '💰', date: null, est_date: null, done: false },
];

function formatDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s + 'Z' : s);
  const IST = new Date(d.getTime() + (s.includes('T') ? 5.5 * 3600000 : 0));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(IST.getUTCDate())}/${pad(IST.getUTCMonth() + 1)}/${IST.getUTCFullYear()}`;
}

function StepNode({ step, index, isCurrent, total }: { step: TimelineStep; index: number; isCurrent: boolean; total: number }) {
  const isLast = index === total - 1;

  const circleClass = step.done
    ? 'bg-green-500 border-green-500'
    : isCurrent
      ? 'bg-transparent border-blue-400 animate-pulse'
      : 'bg-transparent border-gray-600 border-dashed';

  const labelClass = step.done ? 'text-white font-semibold' : isCurrent ? 'text-blue-400 font-semibold' : 'text-gray-500';

  return (
    <div className="flex flex-col items-center flex-1 relative">
      {/* Connector line (left side, skip on first) */}
      {index > 0 && (
        <div
          className={`hidden md:block absolute top-6 right-1/2 w-full h-0.5 ${
            step.done ? 'bg-green-500' : 'bg-gray-700'
          }`}
          style={{ zIndex: 0 }}
        />
      )}

      {/* Circle */}
      <div
        className={`relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl ${circleClass}`}
        style={{ minWidth: '3rem' }}
      >
        {step.done ? '✓' : step.icon}
        {isCurrent && (
          <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-60" />
        )}
      </div>

      {/* Label */}
      <span className={`mt-2 text-xs text-center ${labelClass}`}>{step.step}</span>

      {/* Date */}
      {step.date ? (
        <span className="text-xs text-green-400 mt-1">{formatDate(step.date)}</span>
      ) : step.est_date ? (
        <span className="text-xs text-gray-500 mt-1 italic">~{formatDate(step.est_date)}</span>
      ) : null}
    </div>
  );
}

function VerticalStepNode({ step, isCurrent }: { step: TimelineStep; isCurrent: boolean }) {
  const circleClass = step.done
    ? 'bg-green-500 border-green-500 text-white'
    : isCurrent
      ? 'bg-transparent border-blue-400 text-blue-400 animate-pulse'
      : 'bg-transparent border-gray-600 border-dashed text-gray-500';

  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg flex-shrink-0 ${circleClass}`}>
          {step.done ? '✓' : step.icon}
          {isCurrent && <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-60" />}
        </div>
        <div className="w-0.5 h-8 bg-gray-700 mt-1 last:hidden" />
      </div>
      <div className="pb-8">
        <p className={`font-semibold text-sm ${step.done ? 'text-white' : isCurrent ? 'text-blue-400' : 'text-gray-500'}`}>
          {step.step}
        </p>
        {step.date ? (
          <p className="text-xs text-green-400">{formatDate(step.date)}</p>
        ) : step.est_date ? (
          <p className="text-xs text-gray-500 italic">Est. {formatDate(step.est_date)}</p>
        ) : null}
      </div>
    </div>
  );
}

const PORTAL_LABELS: Record<string, string> = {
  nsp: 'NSP',
  pmss: 'PMSS',
  csss: 'CSSS',
  minority: 'Minority',
};

export default function TrackApplication() {
  const router = useRouter();
  const { id } = router.query;
  const [app, setApp] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not_found' | 'unavailable' | null>(null);

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchApplication = async () => {
      try {
        const res = await fetch(buildApplicationTimelineApiPath(String(id)), buildBackendRequestInit());
        if (res.status === 404) {
          setApp(null);
          setLoadError('not_found');
          return;
        }
        if (!res.ok) throw new Error(`Timeline request failed with ${res.status}`);
        const data: AppData = await res.json();
        setApp(data);
        setLoadError(null);
      } catch {
        setLoadError('unavailable');
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
    const timer = setInterval(fetchApplication, 30000);
    return () => clearInterval(timer);
  }, [router.isReady, id]);

  if (!router.isReady || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-2xl animate-pulse space-y-6">
          <div className="h-4 bg-gray-800 w-40 mx-auto rounded" />
          <div className="h-8 bg-gray-800 w-64 mx-auto rounded" />
          <div className="flex justify-around mt-10">
            {[0,1,2,3].map(i => <div key={i} className="h-20 w-20 bg-gray-800 rounded-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!app && loadError === 'unavailable') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl mb-6">⚠️</div>
          <h1 className="text-2xl text-amber-300 font-bold">Tracking temporarily unavailable</h1>
          <p className="text-gray-400">
            GovBot could not reach the live tracking service just now. Your confirmation number may still be valid.
          </p>
          <div className="pt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => router.reload()}
              className="border border-amber-400 px-6 py-2 rounded text-amber-200 hover:bg-amber-500/10 transition-colors"
            >
              Try Again
            </button>
            <Link href={TRACK_SEARCH_HREF} className="text-blue-400 hover:text-blue-300 border border-blue-500 px-6 py-2 rounded transition-colors">
              Search Another
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="text-6xl mb-6">❌</div>
          <h1 className="text-2xl text-red-400 font-bold">Application Not Found</h1>
          <p className="text-gray-400">Check your confirmation number and try again.</p>
          <div className="pt-6">
            <Link href={TRACK_SEARCH_HREF} className="text-blue-400 hover:text-blue-300 border border-blue-500 px-6 py-2 rounded transition-colors">
              ← Search Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const steps: TimelineStep[] = app.timeline_steps?.length ? app.timeline_steps : DEFAULT_STEPS;
  const currentIndex = steps.reduce((acc, s, i) => (s.done ? i : acc), -1) + 1;
  const isCurrent = (i: number) => i === currentIndex && currentIndex < steps.length;

  const portalLabel = PORTAL_LABELS[app.portal] ?? app.portal?.toUpperCase() ?? 'NSP';
  const whatsappLink = `https://wa.me/919999999999?text=Status+of+${app.confirmation_number}`;
  const showWaitingBanner = app.status === 'submitted' || app.status === 'processing';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-2">
          <Link href="/" className="text-blue-400 text-sm hover:text-blue-300">⚡ GovBot</Link>
        </div>

        {/* Top meta */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Confirmation Number</p>
            <p className="text-lg font-mono font-bold text-white break-all">{app.confirmation_number}</p>
            <p className="text-sm text-gray-400 mt-1">{app.service}</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className="text-xs font-semibold bg-indigo-700 text-white px-3 py-1 rounded-full">{portalLabel}</span>
            {app.submitted_at && (
              <span className="text-xs text-gray-400">Submitted {formatDate(app.submitted_at)}</span>
            )}
          </div>
        </div>

        {showWaitingBanner && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-200">Application received</p>
            <p className="mt-1 text-sm text-gray-300">
              GovBot has submitted your application. It may take some time before the portal reflects the next step for review or approval.
            </p>
          </div>
        )}

        {/* Desktop horizontal timeline */}
        <div className="hidden md:flex items-start justify-between bg-gray-900 rounded-xl p-8 mb-8 relative">
          {steps.map((step, i) => (
            <StepNode key={i} step={step} index={i} isCurrent={isCurrent(i)} total={steps.length} />
          ))}
        </div>

        {/* Mobile vertical timeline */}
        <div className="md:hidden bg-gray-900 rounded-xl p-6 mb-8">
          {steps.map((step, i) => (
            <VerticalStepNode key={i} step={step} isCurrent={isCurrent(i)} />
          ))}
        </div>

        {/* Need help */}
        <div className="text-center mt-8">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            💬 Need help? Chat on WhatsApp
          </a>
        </div>

        {loadError === 'unavailable' && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Live refresh is temporarily unavailable. The latest saved timeline is still shown below.
          </div>
        )}

        {/* Footer links */}
        <div className="mt-8 flex justify-between text-sm">
          <Link href={TRACK_SEARCH_HREF} className="text-blue-400 hover:text-blue-300">← Check another</Link>
          <Link href={buildDashboardLoginHref()} className="text-blue-400 hover:text-blue-300">My Applications →</Link>
        </div>

      </div>
    </div>
  );
}
