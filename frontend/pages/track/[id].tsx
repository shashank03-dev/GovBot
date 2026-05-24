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
  { step: 'Applied', icon: 'A', date: null, est_date: null, done: false },
  { step: 'Under Review', icon: 'R', date: null, est_date: null, done: false },
  { step: 'Approved', icon: 'V', date: null, est_date: null, done: false },
  { step: 'Disbursed', icon: 'D', date: null, est_date: null, done: false },
];

const PORTAL_BADGES: Record<string, { bg: string; text: string }> = {
  nsp: { bg: '#fff7ed', text: '#c2410c' },
  pmss: { bg: '#fef2f2', text: '#b91c1c' },
  csss: { bg: '#eff6ff', text: '#1d4ed8' },
  minority: { bg: '#ecfdf5', text: '#047857' },
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? `${value}Z` : value);
  const istDate = new Date(date.getTime() + (value.includes('T') ? 5.5 * 3600000 : 0));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(istDate.getUTCDate())}/${pad(istDate.getUTCMonth() + 1)}/${istDate.getUTCFullYear()}`;
}

function StepNode({
  step,
  index,
  isCurrent,
}: {
  step: TimelineStep;
  index: number;
  isCurrent: boolean;
}) {
  const circleClass = step.done
    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200'
    : isCurrent
      ? 'border-[#ff9933] bg-orange-50 text-[#e67e00]'
      : 'border-slate-200 bg-white text-slate-400';
  const labelClass = step.done
    ? 'text-slate-900 font-semibold'
    : isCurrent
      ? 'text-[#e67e00] font-semibold'
      : 'text-slate-400';
  const showConnector = index > 0;

  return (
    <div className="relative flex flex-1 flex-col items-center">
      {showConnector && (
        <div
          className={`absolute right-1/2 top-6 hidden h-0.5 w-full md:block ${
            step.done ? 'bg-emerald-300' : 'bg-slate-200'
          }`}
        />
      )}

      <div className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold ${circleClass}`}>
        {step.done ? 'OK' : step.icon}
        {isCurrent && <span className="absolute inset-0 rounded-full border-2 border-orange-300 animate-ping opacity-70" />}
      </div>

      <span className={`mt-3 text-center text-xs ${labelClass}`}>{step.step}</span>
      {step.date ? (
        <span className="mt-1 text-xs text-emerald-600">{formatDate(step.date)}</span>
      ) : step.est_date ? (
        <span className="mt-1 text-xs italic text-slate-400">~{formatDate(step.est_date)}</span>
      ) : null}
    </div>
  );
}

function VerticalStepNode({ step, isCurrent, isLast }: { step: TimelineStep; isCurrent: boolean; isLast: boolean }) {
  const circleClass = step.done
    ? 'border-emerald-500 bg-emerald-500 text-white'
    : isCurrent
      ? 'border-[#ff9933] bg-orange-50 text-[#e67e00]'
      : 'border-slate-200 bg-white text-slate-400';

  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold ${circleClass}`}>
          {step.done ? 'OK' : step.icon}
          {isCurrent && <span className="absolute inset-0 rounded-full border-2 border-orange-300 animate-ping opacity-70" />}
        </div>
        {!isLast && <div className="mt-1 h-8 w-0.5 bg-slate-200" />}
      </div>
      <div className="pb-7">
        <p className={`text-sm ${step.done ? 'font-semibold text-slate-900' : isCurrent ? 'font-semibold text-[#e67e00]' : 'text-slate-400'}`}>
          {step.step}
        </p>
        {step.date ? (
          <p className="text-xs text-emerald-600">{formatDate(step.date)}</p>
        ) : step.est_date ? (
          <p className="text-xs italic text-slate-400">Est. {formatDate(step.est_date)}</p>
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

function CenterState({
  title,
  body,
  actionLabel,
  actionHref,
  retry,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  retry?: () => void;
}) {
  return (
    <div className="min-h-screen gradient-hero px-4 py-10">
      <div className="mx-auto flex max-w-xl items-center justify-center">
        <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-2xl text-[#e67e00]">
            !
          </div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{body}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {retry && (
              <button
                type="button"
                onClick={retry}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
              >
                Try again
              </button>
            )}
            <Link
              href={actionHref}
              className="rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5"
            >
              {actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        if (!res.ok) {
          throw new Error(`Timeline request failed with ${res.status}`);
        }
        const data: AppData = await res.json();
        setApp(data);
        setLoadError(null);
      } catch {
        setLoadError('unavailable');
      } finally {
        setLoading(false);
      }
    };

    void fetchApplication();
    const timer = setInterval(fetchApplication, 30000);
    return () => clearInterval(timer);
  }, [router.isReady, id]);

  if (!router.isReady || loading) {
    return (
      <div className="min-h-screen gradient-hero px-4 py-10">
        <div className="mx-auto max-w-4xl animate-pulse space-y-6 rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)]">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="h-8 w-72 rounded bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-28 rounded-3xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!app && loadError === 'unavailable') {
    return (
      <CenterState
        title="Tracking temporarily unavailable"
        body="GovBot could not reach the live tracking service right now. Your confirmation number may still be valid."
        actionLabel="Search another application"
        actionHref={TRACK_SEARCH_HREF}
        retry={() => router.reload()}
      />
    );
  }

  if (!app) {
    return (
      <CenterState
        title="Application not found"
        body="Check the confirmation number and try again."
        actionLabel="Search again"
        actionHref={TRACK_SEARCH_HREF}
      />
    );
  }

  const steps: TimelineStep[] = app.timeline_steps?.length ? app.timeline_steps : DEFAULT_STEPS;
  const currentIndex = steps.reduce((acc, step, index) => (step.done ? index : acc), -1) + 1;
  const isCurrent = (index: number) => index === currentIndex && currentIndex < steps.length;
  const portalLabel = PORTAL_LABELS[app.portal] ?? app.portal?.toUpperCase() ?? 'NSP';
  const portalBadge = PORTAL_BADGES[app.portal] ?? { bg: '#fff7ed', text: '#c2410c' };
  const whatsappLink = `https://wa.me/919999999999?text=Status+of+${app.confirmation_number}`;
  const showWaitingBanner = app.status === 'submitted' || app.status === 'processing';

  return (
    <div className="min-h-screen gradient-hero">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="hover:text-[#ff9933] transition-colors">GovBot</Link>
          <span>/</span>
          <Link href={TRACK_SEARCH_HREF} className="hover:text-[#ff9933] transition-colors">Track</Link>
          <span>/</span>
          <span className="text-slate-600">{app.confirmation_number}</span>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Confirmation number
              </p>
              <p className="mt-2 break-all text-lg font-bold text-slate-900 sm:text-xl">
                {app.confirmation_number}
              </p>
              <p className="mt-2 text-sm text-slate-500">{app.service}</p>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]"
                style={{ backgroundColor: portalBadge.bg, color: portalBadge.text }}
              >
                {portalLabel}
              </span>
              {app.submitted_at && (
                <span className="text-xs text-slate-400">Submitted {formatDate(app.submitted_at)}</span>
              )}
            </div>
          </div>

          {showWaitingBanner && (
            <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-700">Application received</p>
              <p className="mt-1 text-sm leading-6 text-amber-900/70">
                GovBot has submitted your application. It may take some time before the next review or approval step appears.
              </p>
            </div>
          )}

          <div className="mt-8 hidden rounded-[28px] border border-slate-200 bg-slate-50/75 p-8 md:flex md:items-start md:justify-between">
            {steps.map((step, index) => (
              <StepNode key={`${step.step}-${index}`} step={step} index={index} isCurrent={isCurrent(index)} />
            ))}
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/75 p-6 md:hidden">
            {steps.map((step, index) => (
              <VerticalStepNode
                key={`${step.step}-${index}`}
                step={step}
                isCurrent={isCurrent(index)}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>

          {loadError === 'unavailable' && (
            <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              Live refresh is temporarily unavailable. The latest saved timeline is still shown here.
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe57]"
            >
              Need help on WhatsApp
            </a>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={TRACK_SEARCH_HREF} className="rounded-2xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]">
                Check another
              </Link>
              <Link href={buildDashboardLoginHref()} className="rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-2.5 font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5">
                My applications
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
