import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExternalLink, Landmark, ShieldCheck } from 'lucide-react';

type SanctionRow = {
  scheme: string;
  amount_inr: number;
  sanction_tx_hash: string;
  sanctioned_at: string;
  authority: string;
  explorer_url?: string | null;
};

type ReleaseRow = {
  release_id: string;
  scheme: string;
  amount_inr: number;
  beneficiary_count: number;
  ready_count: number;
  blocked_count: number;
  tx_hash: string;
  released_at: string;
  official_username: string;
  explorer_url?: string | null;
};

type TransparencyPayload = {
  sanctions: SanctionRow[];
  releases: ReleaseRow[];
};

function formatDate(dateStr: string) {
  if (!dateStr) {
    return 'N/A';
  }
  return new Date(dateStr).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransparencyPage() {
  const [payload, setPayload] = useState<TransparencyPayload>({ sanctions: [], releases: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadLedger = async () => {
      try {
        const response = await fetch('/api/treasury/releases/public');
        const data = (await response.json().catch(() => ({}))) as TransparencyPayload;
        if (!response.ok) {
          throw new Error('Failed to load transparency ledger');
        }
        if (active) {
          setPayload({
            sanctions: data.sanctions || [],
            releases: data.releases || [],
          });
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load transparency ledger');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadLedger();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Transparency Ledger | GovBot</title>
        <meta
          name="description"
          content="Public scholarship sanction and release ledger with blockchain proof links and beneficiary-readiness counts."
        />
      </Head>

      <div className="min-h-screen gradient-hero px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-[#ff9933] transition-colors">GovBot</Link>
            <span>/</span>
            <span className="text-slate-600">Transparency ledger</span>
          </div>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#e67e00]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Public audit
                </div>
                <h1 className="mt-4 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Scholarship transparency ledger
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  View scheme sanctions, on-chain release proofs, and how many beneficiaries are still blocked by missing bank verification before payout.
                </p>
              </div>

              <Link
                href="/services"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
              >
                Back to services
              </Link>
            </div>
          </section>

          {error ? (
            <section className="rounded-[30px] border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
              {error}
            </section>
          ) : null}

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-[#e67e00]" />
              <div>
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Treasury sanctions
                </h2>
                <p className="mt-1 text-sm text-slate-500">Higher-authority allocations released to the department treasury wallet.</p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-slate-500">Loading sanctions...</p>
            ) : payload.sanctions.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Scheme</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Authority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payload.sanctions.map((item) => (
                      <tr key={`${item.scheme}-${item.sanction_tx_hash}`} className="hover:bg-slate-50/70">
                        <td className="px-4 py-4 text-sm font-semibold text-slate-900">{item.scheme.toUpperCase()}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">₹{Math.round(item.amount_inr).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{item.authority}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{formatDate(item.sanctioned_at)}</td>
                        <td className="px-4 py-4 text-sm">
                          {item.explorer_url ? (
                            <a href={item.explorer_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#e67e00] hover:text-slate-900">
                              View
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                No sanctions published yet.
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Release batches
              </h2>
              <p className="mt-1 text-sm text-slate-500">On-chain release authorization, payout-ready counts, and bank-verification blockers.</p>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-slate-500">Loading releases...</p>
            ) : payload.releases.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Scheme</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Beneficiaries</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ready</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Need bank verify</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Released by</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payload.releases.map((item) => (
                      <tr key={item.release_id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-4 text-sm font-semibold text-slate-900">{item.scheme.toUpperCase()}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">₹{Math.round(item.amount_inr).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{item.beneficiary_count}</td>
                        <td className="px-4 py-4 text-sm text-teal-700">{item.ready_count}</td>
                        <td className="px-4 py-4 text-sm text-[#e67e00]">{item.blocked_count}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{item.official_username}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{formatDate(item.released_at)}</td>
                        <td className="px-4 py-4 text-sm">
                          {item.explorer_url ? (
                            <a href={item.explorer_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#e67e00] hover:text-slate-900">
                              View
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                No release batches published yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
