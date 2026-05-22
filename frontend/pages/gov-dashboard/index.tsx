import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BadgeIndianRupee,
  Landmark,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import AnimatedCounter, { AnimatedCurrency } from '@/components/AnimatedCounter';

interface DashboardStats {
  total_applications: number;
  status_breakdown: Record<string, number>;
  total_credentials_issued: number;
  total_disbursed_inr: number;
  verified_bank_accounts: number;
  fraud_flags: number;
  today_applications: number;
  updated_at: string;
}

interface RealtimeStats {
  last_hour_applications: number;
  active_sessions: number;
  pending_disbursements: number;
  timestamp: string;
}

type Tone = 'saffron' | 'teal' | 'blue' | 'red';

const toneClasses: Record<Tone, { chip: string; panel: string; icon: string; text: string }> = {
  saffron: {
    chip: 'bg-orange-50 text-[#e67e00]',
    panel: 'border-orange-100 bg-orange-50/70',
    icon: 'bg-orange-100 text-[#e67e00]',
    text: 'text-[#e67e00]',
  },
  teal: {
    chip: 'bg-teal-50 text-teal-700',
    panel: 'border-teal-100 bg-teal-50/70',
    icon: 'bg-teal-100 text-teal-700',
    text: 'text-teal-700',
  },
  blue: {
    chip: 'bg-blue-50 text-blue-700',
    panel: 'border-blue-100 bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    text: 'text-blue-700',
  },
  red: {
    chip: 'bg-red-50 text-red-700',
    panel: 'border-red-100 bg-red-50/70',
    icon: 'bg-red-100 text-red-700',
    text: 'text-red-700',
  },
};

function StatCard({
  title,
  value,
  subtitle,
  tone,
  href,
  icon,
  formatter = (input) => <AnimatedCounter end={input} />,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone: Tone;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  formatter?: (value: number) => ReactNode;
}) {
  const Icon = icon;
  const tones = toneClasses[tone];

  const content = (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`h-full rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-lg ${tones.panel}`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <div className="mt-3 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {formatter(value)}
          </div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-sm text-slate-500">{subtitle}</p>
      {href ? (
        <div className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${tones.text}`}>
          Open details <ArrowRight className="h-4 w-4" />
        </div>
      ) : null}
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

function NavCard({
  href,
  title,
  description,
  meta,
  tone,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  meta: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = icon;
  const tones = toneClasses[tone];

  return (
    <Link href={href} className="block h-full">
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {title}
            </h3>
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones.chip}`}>
              {meta}
            </span>
          </div>
        </div>
        <p className="mb-5 text-sm leading-6 text-slate-500">{description}</p>
        <div className={`mt-auto inline-flex items-center gap-1 text-sm font-semibold ${tones.text}`}>
          View section <ArrowRight className="h-4 w-4" />
        </div>
      </motion.div>
    </Link>
  );
}

export default function GovDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchDashboardData();

    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const statsRes = await fetch('/api/analytics/overview');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      const realtimeRes = await fetch('/api/analytics/realtime');
      if (realtimeRes.ok) {
        const realtimeData = await realtimeRes.json();
        setRealtime(realtimeData);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalApplications = stats?.total_applications || 0;
  const orderedStatuses = ['submitted', 'approved', 'processing', 'rejected'];
  const sortedStatusEntries = orderedStatuses.map(
    (status) => [status, stats?.status_breakdown?.[status] || 0] as const
  );

  if (loading) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center px-4">
        <div className="rounded-2xl border border-orange-100 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">Loading government analytics</p>
          <p className="mt-2 text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Preparing the latest dashboard snapshot...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Government Dashboard | GovBot</title>
      </Head>

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
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-[#e67e00]">
                <Sparkles className="h-4 w-4" />
                GovBot public-sector analytics
              </div>

              <div className="max-w-3xl">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Government Analytics
                </h1>
                <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">
                  Real-time scholarship program monitoring with the same clear, citizen-friendly UI used across the rest of GOVbot.
                </p>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Applications today</p>
                  <div className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    <AnimatedCounter end={stats?.today_applications || 0} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Fresh submissions added since midnight</p>
                </div>
                <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Verified accounts</p>
                  <div className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    <AnimatedCounter end={stats?.verified_bank_accounts || 0} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Ready for compliant disbursement runs</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Auto refresh</p>
                  <div className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    30s
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Data polling stays active while this page is open</p>
                </div>
              </div>
            </motion.section>

            <motion.aside
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <motion.span
                    className="h-2.5 w-2.5 rounded-full bg-emerald-500"
                    animate={{ scale: [1, 1.15, 1], opacity: [1, 0.8, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  Live
                </div>

                <motion.button
                  onClick={fetchDashboardData}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200/50 transition-shadow hover:shadow-orange-300/60"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </motion.button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Last updated</p>
                <p className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {lastUpdated.toLocaleTimeString('en-IN')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Snapshot for scholarship operations and fraud review.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Program health</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">Stable intake with low exception count</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Recommended next step</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">Review flagged cases before the next payout batch</p>
                </div>
              </div>
            </motion.aside>
          </div>

          {realtime ? (
            <section className="mb-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-[#e67e00]">
                    <Activity className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Last hour</p>
                    <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      <AnimatedCounter end={realtime.last_hour_applications} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">Applications submitted in the latest 60-minute window.</p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Users className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Active sessions</p>
                    <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      <AnimatedCounter end={realtime.active_sessions} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">Users active across portals during the last 15 minutes.</p>
              </div>

              <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <BadgeIndianRupee className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Pending payouts</p>
                    <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      <AnimatedCounter end={realtime.pending_disbursements} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">Queued disbursements waiting for the next payment pass.</p>
              </div>
            </section>
          ) : null}

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total applications"
              value={totalApplications}
              subtitle={`+${stats?.today_applications || 0} added today`}
              tone="saffron"
              icon={Landmark}
            />
            <StatCard
              title="Scholarships disbursed"
              value={stats?.total_disbursed_inr || 0}
              subtitle={`${stats?.verified_bank_accounts || 0} verified bank accounts`}
              tone="blue"
              href="/gov-dashboard/disbursements"
              icon={BadgeIndianRupee}
              formatter={(value) => <AnimatedCurrency end={value} />}
            />
            <StatCard
              title="Blockchain credentials"
              value={stats?.total_credentials_issued || 0}
              subtitle="Issued and verifiable on Polygon"
              tone="teal"
              icon={ShieldCheck}
            />
            <StatCard
              title="Fraud flags"
              value={stats?.fraud_flags || 0}
              subtitle={stats?.fraud_flags ? 'Cases waiting for review' : 'No active exceptions right now'}
              tone={stats?.fraud_flags ? 'red' : 'teal'}
              href="/gov-dashboard/fraud"
              icon={ShieldAlert}
            />
          </section>

          <section className="mb-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Application status breakdown
                </h2>
                <p className="text-sm text-slate-500">A cleaner view of the approval pipeline for the current portfolio.</p>
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
                {totalApplications.toLocaleString('en-IN')} total applications
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sortedStatusEntries.map(([status, count], index) => {
                const ratio = totalApplications ? (count / totalApplications) * 100 : 0;
                const tone: Tone =
                  status === 'approved'
                    ? 'teal'
                    : status === 'rejected'
                      ? 'red'
                      : status === 'processing'
                        ? 'blue'
                        : 'saffron';
                const tones = toneClasses[tone];

                return (
                  <motion.div
                    key={status}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium capitalize text-slate-500">{status}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones.chip}`}>
                        {ratio.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-3 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      <AnimatedCounter end={count} />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ratio}%` }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 + index * 0.04 }}
                        className={`h-full rounded-full ${
                          tone === 'teal'
                            ? 'bg-teal-500'
                            : tone === 'red'
                              ? 'bg-red-500'
                              : tone === 'blue'
                                ? 'bg-blue-500'
                                : 'bg-orange-400'
                        }`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <NavCard
              href="/gov-dashboard/fraud"
              title="Fraud Detection"
              description="Review duplicate Aadhaar signals and suspicious application patterns in the same softer interface language."
              meta={`${stats?.fraud_flags || 0} active flags`}
              tone="red"
              icon={ShieldAlert}
            />
            <NavCard
              href="/gov-dashboard/disbursements"
              title="Disbursements"
              description="Track payout batches, bank verification progress, and NPCI-linked scholarship payment movement."
              meta={`${realtime?.pending_disbursements || 0} pending`}
              tone="blue"
              icon={BadgeIndianRupee}
            />
            <NavCard
              href="/gov-dashboard/regional"
              title="Regional Analytics"
              description="Open the portal-wise distribution view to compare intake, approvals, and submission mix."
              meta="Portal reports"
              tone="teal"
              icon={Activity}
            />
          </section>

          <div className="mt-8 text-center">
            <p className="text-xs text-slate-400">
              GovBot Analytics Dashboard · Refreshes automatically every 30 seconds while this page is open
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
