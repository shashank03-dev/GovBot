import Head from 'next/head';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Globe2,
  Map,
} from 'lucide-react';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  AnalyticsLoadingState,
  AnalyticsPageShell,
  AnalyticsSection,
  AnalyticsStatCard,
  getAnalyticsToneClasses,
} from '@/components/gov-dashboard/AnalyticsPageShell';

interface PortalData {
  count: number;
  name: string;
  submitted: number;
  approved: number;
  rejected: number;
}

interface RegionalData {
  by_portal: Record<string, PortalData>;
  note: string;
}

export default function RegionalDashboard() {
  const [data, setData] = useState<RegionalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRegionalData();
  }, []);

  const fetchRegionalData = async () => {
    try {
      const res = await fetch('/api/analytics/regional');
      if (res.ok) {
        const regionalData = await res.json();
        setData(regionalData);
      }
    } catch (err) {
      console.error('Regional data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const portals = Object.entries(data?.by_portal || {});
  const totalApps = portals.reduce((sum, [, portal]) => sum + portal.count, 0);
  const totalApproved = portals.reduce((sum, [, portal]) => sum + (portal.approved || 0), 0);
  const totalPending = portals.reduce((sum, [, portal]) => sum + (portal.submitted || 0), 0);

  if (loading) {
    return (
      <AnalyticsLoadingState
        title="Loading regional analytics"
        description="Preparing the latest portal-wise scholarship distribution snapshot..."
      />
    );
  }

  return (
    <>
      <Head>
        <title>Regional Analytics | GovBot Analytics</title>
      </Head>

      <AnalyticsPageShell
        title="Regional Analytics"
        description="Portal-wise scholarship distribution with a more readable breakdown for approvals, pending applications, and overall participation."
        icon={<Map className="h-7 w-7" />}
        summaryLabel="Active portals"
        summaryValue={<AnimatedCounter end={portals.length} />}
        summaryText="Schemes currently represented in the scholarship analytics dataset."
        onRefresh={fetchRegionalData}
      >
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AnalyticsStatCard
            label="Total applications"
            value={totalApps}
            subtext="Combined application volume across all tracked portals"
            tone="saffron"
            icon={BarChart3}
          />
          <AnalyticsStatCard
            label="Approved"
            value={totalApproved}
            subtext={`${totalApps ? ((totalApproved / totalApps) * 100).toFixed(1) : '0.0'}% approval rate`}
            tone="teal"
            icon={CheckCircle2}
          />
          <AnalyticsStatCard
            label="Active portals"
            value={portals.length}
            subtext="Portal cohorts with at least one tracked application"
            tone="blue"
            icon={Globe2}
          />
          <AnalyticsStatCard
            label="Pending"
            value={totalPending}
            subtext="Applications still waiting for approval or rejection"
            tone="red"
            icon={Clock3}
          />
        </section>

        <div className="mb-8">
          <AnalyticsSection
            title="Portal breakdown"
            description="Status mix for each supported scholarship portal based on the currently available application data."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {portals.map(([key, portal]) => {
                const approvedPct = portal.count ? ((portal.approved || 0) / portal.count) * 100 : 0;
                const submittedPct = portal.count ? ((portal.submitted || 0) / portal.count) * 100 : 0;
                const rejectedPct = portal.count ? ((portal.rejected || 0) / portal.count) * 100 : 0;

                return (
                  <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          {portal.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">Portal-wide scholarship activity snapshot</p>
                      </div>
                      <div className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
                        <AnimatedCounter end={portal.count} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {[
                        { label: 'Approved', value: portal.approved || 0, percent: approvedPct, tone: 'teal' as const },
                        { label: 'Submitted', value: portal.submitted || 0, percent: submittedPct, tone: 'saffron' as const },
                        { label: 'Rejected', value: portal.rejected || 0, percent: rejectedPct, tone: 'red' as const },
                      ].map((item) => {
                        const tones = getAnalyticsToneClasses(item.tone);

                        return (
                          <div key={item.label}>
                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                              <span className={`font-medium ${tones.text}`}>{item.label}</span>
                              <span className="font-semibold text-slate-700">{item.value}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white">
                              <div
                                className={`h-full rounded-full ${tones.progress}`}
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200 pt-5 text-center">
                      <div className="rounded-2xl bg-white px-3 py-3">
                        <div className="text-2xl font-bold text-teal-700" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          {portal.approved || 0}
                        </div>
                        <div className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Approved</div>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-3">
                        <div className="text-2xl font-bold text-[#e67e00]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          {portal.submitted || 0}
                        </div>
                        <div className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pending</div>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-3">
                        <div className="text-2xl font-bold text-red-700" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          {portal.rejected || 0}
                        </div>
                        <div className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rejected</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AnalyticsSection>
        </div>

        <AnalyticsSection
          title="Analytics coverage"
          description={data?.note}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { short: 'NSP', label: 'National Scholarship Portal' },
              { short: 'PMSS', label: 'Post Matric (SC/ST)' },
              { short: 'CSSS', label: 'Central Sector Scholarship' },
              { short: 'Minority', label: 'Minority Scholarship' },
            ].map((portal) => (
              <div key={portal.short} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{portal.short}</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{portal.label}</div>
              </div>
            ))}
          </div>
        </AnalyticsSection>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            GovBot Regional Analytics · Portal-wise scholarship intake and decision distribution
          </p>
        </div>
      </AnalyticsPageShell>
    </>
  );
}
