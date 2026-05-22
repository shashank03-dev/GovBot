import Head from 'next/head';
import { useEffect, useState } from 'react';
import {
  BadgeIndianRupee,
  CircleX,
  Clock3,
  CreditCard,
  Landmark,
  LoaderCircle,
} from 'lucide-react';
import { AnimatedCurrency } from '@/components/AnimatedCounter';
import {
  AnalyticsEmptyState,
  AnalyticsLoadingState,
  AnalyticsPageShell,
  AnalyticsSection,
  AnalyticsStatCard,
  getAnalyticsToneClasses,
  type AnalyticsTone,
} from '@/components/gov-dashboard/AnalyticsPageShell';

interface Disbursement {
  id: string;
  confirmation_number: string;
  phone: string;
  amount: number;
  status: string;
  npci_txn_id: string | null;
  credited_at: string | null;
  created_at: string;
}

interface DisbursementSummary {
  status_counts: Record<string, number>;
  pending_amount_inr: number;
  credited_amount_inr: number;
  recent_disbursements: Disbursement[];
}

export default function DisbursementsDashboard() {
  const [summary, setSummary] = useState<DisbursementSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDisbursementData();
  }, []);

  const fetchDisbursementData = async () => {
    try {
      const res = await fetch('/api/analytics/disbursements/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Disbursement data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusTone = (status: string): AnalyticsTone => {
    const tones: Record<string, AnalyticsTone> = {
      pending: 'saffron',
      processing: 'blue',
      credited: 'teal',
      failed: 'red',
    };
    return tones[status] || 'blue';
  };

  const pendingCount = summary?.status_counts?.pending || 0;
  const creditedCount = summary?.status_counts?.credited || 0;
  const processingCount = summary?.status_counts?.processing || 0;
  const failedCount = summary?.status_counts?.failed || 0;
  const recentDisbursements = summary?.recent_disbursements || [];

  if (loading) {
    return (
      <AnalyticsLoadingState
        title="Loading disbursement analytics"
        description="Preparing the latest payout and NPCI tracking snapshot..."
      />
    );
  }

  return (
    <>
      <Head>
        <title>Disbursements | GovBot Analytics</title>
      </Head>

      <AnalyticsPageShell
        title="Disbursement Tracking"
        description="Scholarship payment monitoring and NPCI transaction status in the same calm, readable GOVbot interface."
        icon={<BadgeIndianRupee className="h-7 w-7" />}
        summaryLabel="Pending amount"
        summaryValue={<AnimatedCurrency end={summary?.pending_amount_inr || 0} />}
        summaryText="Queued payout volume waiting for the next processing pass."
        onRefresh={fetchDisbursementData}
      >
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AnalyticsStatCard
            label="Pending"
            value={pendingCount}
            subtext={`₹${(summary?.pending_amount_inr || 0).toLocaleString('en-IN')} awaiting release`}
            tone="saffron"
            icon={Clock3}
          />
          <AnalyticsStatCard
            label="Credited"
            value={creditedCount}
            subtext={`₹${(summary?.credited_amount_inr || 0).toLocaleString('en-IN')} settled successfully`}
            tone="teal"
            icon={Landmark}
          />
          <AnalyticsStatCard
            label="Processing"
            value={processingCount}
            subtext="Transfers currently moving through the bank workflow"
            tone="blue"
            icon={LoaderCircle}
          />
          <AnalyticsStatCard
            label="Failed"
            value={failedCount}
            subtext="Transactions needing follow-up or retry handling"
            tone="red"
            icon={CircleX}
          />
        </section>

        <div className="mb-8">
          <AnalyticsSection
            title="Recent disbursements"
            description="Latest scholarship payment records with confirmation and NPCI status details."
          >
            {recentDisbursements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Confirmation</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Txn ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentDisbursements.map((disbursement) => {
                      const tone = getStatusTone(disbursement.status);
                      const tones = getAnalyticsToneClasses(tone);

                      return (
                        <tr key={disbursement.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-4 text-sm font-medium text-slate-900">{disbursement.confirmation_number}</td>
                          <td className="px-4 py-4 text-sm text-slate-500">{disbursement.phone}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                            ₹{disbursement.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones.chip}`}>
                              {disbursement.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500">{disbursement.npci_txn_id || '—'}</td>
                          <td className="px-4 py-4 text-sm text-slate-500">
                            {formatDate(disbursement.credited_at || disbursement.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <AnalyticsEmptyState
                icon={<CreditCard className="h-7 w-7" />}
                title="No disbursements yet"
                description="No scholarship disbursements have been processed yet."
              />
            )}
          </AnalyticsSection>
        </div>

        <AnalyticsSection
          title="NPCI integration"
          description="Bank account verification and payout tracking signals used during scholarship disbursement operations."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              'Penny drop verification through a ₹0.01 test transaction',
              'Real-time account validation before payout execution',
              'Automatic disbursement tracking for credited and pending states',
              'SMS and WhatsApp notifications when funds are credited',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </AnalyticsSection>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            GovBot Disbursement Analytics · Monitoring scholarship payout movement and NPCI-linked status updates
          </p>
        </div>
      </AnalyticsPageShell>
    </>
  );
}
