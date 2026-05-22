import Head from 'next/head';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  AnalyticsEmptyState,
  AnalyticsLoadingState,
  AnalyticsPageShell,
  AnalyticsSection,
  AnalyticsStatCard,
  getAnalyticsToneClasses,
} from '@/components/gov-dashboard/AnalyticsPageShell';

interface FraudFlag {
  id: string;
  aadhaar_hash: string;
  phones: string[];
  portal: string;
  flagged_at: string;
}

interface FraudSummary {
  total_flags: number;
  recent_flags_7d: number;
  unique_fraudsters: number;
  recent_flags: FraudFlag[];
}

export default function FraudDashboard() {
  const [summary, setSummary] = useState<FraudSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFraudData();
  }, []);

  const fetchFraudData = async () => {
    try {
      const res = await fetch('/api/analytics/fraud/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Fraud data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const maskAadhaar = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const hasFlags = (summary?.total_flags || 0) > 0;
  const recentFlags = summary?.recent_flags || [];

  if (loading) {
    return (
      <AnalyticsLoadingState
        title="Loading fraud analytics"
        description="Preparing the latest duplicate detection and exception review snapshot..."
      />
    );
  }

  return (
    <>
      <Head>
        <title>Fraud Detection | GovBot Analytics</title>
      </Head>

      <AnalyticsPageShell
        title="Fraud Detection"
        description="Duplicate Aadhaar and suspicious activity monitoring in the same cleaner, easier-to-scan GOVbot analytics experience."
        icon={<ShieldAlert className="h-7 w-7" />}
        summaryLabel="Current review load"
        summaryValue={<AnimatedCounter end={summary?.total_flags || 0} />}
        summaryText="Active flags currently waiting for validation by operations or compliance teams."
        onRefresh={fetchFraudData}
      >
        <section
          className={`mb-8 rounded-3xl border p-5 shadow-sm ${
            hasFlags ? 'border-red-100 bg-red-50/80' : 'border-teal-100 bg-teal-50/80'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                hasFlags ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
              }`}
            >
              {hasFlags ? <AlertTriangle className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
            </div>
            <div>
              <h2 className={`text-xl font-bold ${hasFlags ? 'text-red-800' : 'text-teal-800'}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {hasFlags ? `${summary?.total_flags || 0} fraud flags detected` : 'No fraud flags'}
              </h2>
              <p className={`mt-1 text-sm ${hasFlags ? 'text-red-700/80' : 'text-teal-700/80'}`}>
                {hasFlags
                  ? `${summary?.recent_flags_7d || 0} new cases in the last 7 days across ${summary?.unique_fraudsters || 0} unique Aadhaar hashes.`
                  : 'All applications are currently passing duplicate detection checks.'}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <AnalyticsStatCard
            label="Total flags"
            value={summary?.total_flags || 0}
            subtext="Current count of suspicious or duplicate cases"
            tone="red"
            icon={ShieldAlert}
          />
          <AnalyticsStatCard
            label="Last 7 days"
            value={summary?.recent_flags_7d || 0}
            subtext="Newly flagged cases over the past week"
            tone="saffron"
            icon={CalendarClock}
          />
          <AnalyticsStatCard
            label="Unique fraudsters"
            value={summary?.unique_fraudsters || 0}
            subtext="Distinct Aadhaar hashes involved in flagged activity"
            tone="blue"
            icon={Users}
          />
        </section>

        <div className="mb-8">
          <AnalyticsSection
            title="Recent fraud flags"
            description="Flagged cases with masked Aadhaar fingerprints, linked numbers, and portal source."
          >
            {recentFlags.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Aadhaar hash</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Phone numbers</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Portal</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Flagged at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentFlags.map((flag) => {
                      const tones = getAnalyticsToneClasses('red');

                      return (
                        <tr key={flag.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-4">
                            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                              <Fingerprint className="h-3.5 w-3.5" />
                              {maskAadhaar(flag.aadhaar_hash)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {flag.phones.map((phone) => (
                                <span key={phone} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                  {phone}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${tones.chip}`}>
                              {flag.portal}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500">{formatDate(flag.flagged_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <AnalyticsEmptyState
                icon={<ShieldCheck className="h-7 w-7" />}
                title="No fraud detected"
                description="The fraud detection system has not flagged any suspicious activity."
              />
            )}
          </AnalyticsSection>
        </div>

        <AnalyticsSection
          title="About fraud detection"
          description="Signals used by GovBot to surface suspicious scholarship activity before disbursement or approval."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {[
              'Hashing and comparing Aadhaar numbers across applications',
              'Flagging when the same Aadhaar is used with different phone numbers',
              'Tracking application patterns and submission velocity',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </AnalyticsSection>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            GovBot Fraud Analytics · Duplicate detection and suspicious pattern monitoring for scholarship workflows
          </p>
        </div>
      </AnalyticsPageShell>
    </>
  );
}
