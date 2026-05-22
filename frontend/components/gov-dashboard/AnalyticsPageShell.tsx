import { type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import AnimatedCounter from '@/components/AnimatedCounter';

export type AnalyticsTone = 'saffron' | 'teal' | 'blue' | 'red';

const toneClasses: Record<
  AnalyticsTone,
  {
    panel: string;
    icon: string;
    text: string;
    chip: string;
    progress: string;
  }
> = {
  saffron: {
    panel: 'border-orange-100 bg-orange-50/70',
    icon: 'bg-orange-100 text-[#e67e00]',
    text: 'text-[#e67e00]',
    chip: 'bg-orange-50 text-[#e67e00]',
    progress: 'bg-orange-400',
  },
  teal: {
    panel: 'border-teal-100 bg-teal-50/70',
    icon: 'bg-teal-100 text-teal-700',
    text: 'text-teal-700',
    chip: 'bg-teal-50 text-teal-700',
    progress: 'bg-teal-500',
  },
  blue: {
    panel: 'border-blue-100 bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    text: 'text-blue-700',
    chip: 'bg-blue-50 text-blue-700',
    progress: 'bg-blue-500',
  },
  red: {
    panel: 'border-red-100 bg-red-50/70',
    icon: 'bg-red-100 text-red-700',
    text: 'text-red-700',
    chip: 'bg-red-50 text-red-700',
    progress: 'bg-red-500',
  },
};

export function getAnalyticsToneClasses(tone: AnalyticsTone) {
  return toneClasses[tone];
}

export function AnalyticsLoadingState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center px-4">
      <div className="rounded-2xl border border-orange-100 bg-white px-6 py-5 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {description}
        </p>
      </div>
    </div>
  );
}

export function AnalyticsPageShell({
  title,
  description,
  icon,
  summaryLabel,
  summaryValue,
  summaryText,
  onRefresh,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  summaryLabel: string;
  summaryValue: ReactNode;
  summaryText: string;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden gradient-mesh">
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-orange-100/40 via-transparent to-transparent" />
      <div className="absolute -left-20 top-20 h-56 w-56 rounded-full bg-orange-200/30 blur-3xl" />
      <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-teal-100/40 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-7 shadow-lg shadow-slate-200/60"
          >
            <Link href="/gov-dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-[#e67e00] transition-colors hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>

            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#e67e00]">
                {icon}
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {title}
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-slate-500 sm:text-lg">{description}</p>
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <motion.button
              onClick={onRefresh}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200/50 transition-shadow hover:shadow-orange-300/60"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </motion.button>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{summaryLabel}</p>
              <div className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {summaryValue}
              </div>
              <p className="mt-1 text-sm text-slate-500">{summaryText}</p>
            </div>
          </motion.aside>
        </div>

        {children}
      </div>
    </div>
  );
}

export function AnalyticsStatCard({
  label,
  value,
  subtext,
  tone,
  icon,
  formatter = (input) => <AnimatedCounter end={input} />,
}: {
  label: string;
  value: number;
  subtext?: string;
  tone: AnalyticsTone;
  icon: ComponentType<{ className?: string }>;
  formatter?: (value: number) => ReactNode;
}) {
  const Icon = icon;
  const tones = getAnalyticsToneClasses(tone);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-lg ${tones.panel}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <div className="mt-3 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {formatter(value)}
          </div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {subtext ? <p className="text-sm text-slate-500">{subtext}</p> : null}
    </motion.div>
  );
}

export function AnalyticsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AnalyticsEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#e67e00]">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        {title}
      </h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
