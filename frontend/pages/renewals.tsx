import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import { getErrorMessage } from '@/lib/errorMessage';

interface Reminder {
  id: string;
  phone: string;
  portal: string;
  renewal_due_date: string;
  sent_at: string | null;
  created_at: string;
}

interface RenewalSummaryItem {
  label: string;
  days_until: number;
  expiry_date?: string;
  renewal_due_date?: string;
}

interface RenewalSummary {
  phone: string;
  document_expiries: RenewalSummaryItem[];
  renewal_reminders: RenewalSummaryItem[];
}

const PORTAL_LABELS: Record<string, string> = {
  nsp: 'NSP',
  pmss: 'PMSS',
  csss: 'CSSS',
  minority: 'Minority',
};

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function summaryBadge(daysUntil: number) {
  if (daysUntil < 0) {
    return {
      className: 'bg-red-50 text-red-700 border-red-200',
      label: `${Math.abs(daysUntil)} days overdue`,
    };
  }
  if (daysUntil <= 7) {
    return {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      label: `${daysUntil} days left`,
    };
  }
  return {
    className: 'bg-green-50 text-green-700 border-green-200',
    label: `${daysUntil} days left`,
  };
}

export default function RenewalsPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [summary, setSummary] = useState<RenewalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // Form state
  const [portal, setPortal] = useState('nsp');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const token = localStorage.getItem('govbot_token');
    const storedPhone = localStorage.getItem('govbot_phone');
    if (!token || !storedPhone) { router.push('/'); return; }
    setPhone(storedPhone);
    fetchReminders(storedPhone);
    fetchSummary(storedPhone);
  }, [mounted, router]);

  if (!mounted) return null;

  async function fetchReminders(userPhone: string) {
    try {
      const res = await fetch(buildProxyApiPath(`renewals/reminders/${encodeURIComponent(userPhone)}`), buildBackendRequestInit());
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummary(userPhone: string) {
    setSummaryLoading(true);
    try {
      const res = await fetch(buildProxyApiPath(`renewals/summary/${encodeURIComponent(userPhone)}`), buildBackendRequestInit());
      if (!res.ok) throw new Error('Failed to fetch summary');
      const data = await res.json();
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!dueDate) return;
    setSubmitting(true);
    setFormMsg('');
    try {
      const res = await fetch(buildProxyApiPath('renewals/register'), buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, portal, renewal_due_date: dueDate }),
      }));
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      setFormMsg(data.message || 'Reminder registered!');
      setDueDate('');
      fetchReminders(phone);
      fetchSummary(phone);
    } catch (error: unknown) {
      setFormMsg(`Error: ${getErrorMessage(error, 'Registration failed')}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(buildProxyApiPath(`renewals/reminders/${id}`), buildBackendRequestInit({ method: 'DELETE' }));
      setReminders(prev => prev.filter(r => r.id !== id));
      fetchSummary(phone);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <Head>
        <title>Renewal Reminders | GovBot</title>
        <meta name="description" content="Manage your scholarship renewal reminders" />
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
          ← Back to Services
        </Link>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Renewal Reminders
          </h1>
          <p className="text-sm text-slate-500 mt-1">Never miss a scholarship renewal deadline</p>
        </div>

        <motion.section
          className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">GovBot Assistant View</h2>
              <p className="text-sm text-slate-700 max-w-2xl">
                Ask GovBot on WhatsApp: <span className="font-medium text-slate-900">&quot;When is this expiring?&quot;</span> or <span className="font-medium text-slate-900">&quot;When is my NSP renewal due?&quot;</span>
              </p>
              <p className="text-xs text-slate-500 mt-2">
                GovBot checks your saved document expiries and scholarship dates, then reminds you before the deadline.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 px-4 py-3 text-xs text-orange-700 font-medium">
              Demo-ready combined summary
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mt-5">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Document Expiries</div>
              {summaryLoading ? (
                <p className="text-sm text-slate-400">Loading vault status...</p>
              ) : summary?.document_expiries?.length ? (
                <div className="space-y-3">
                  {summary.document_expiries.slice(0, 3).map((item) => (
                    (() => {
                      const badge = summaryBadge(item.days_until);
                      return (
                        <div key={`${item.label}-${item.expiry_date}`} className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500">Expires on {formatDate(item.expiry_date || '')}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No vault document expiry dates are saved yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Scholarship Renewals</div>
              {summaryLoading ? (
                <p className="text-sm text-slate-400">Loading renewal status...</p>
              ) : summary?.renewal_reminders?.length ? (
                <div className="space-y-3">
                  {summary.renewal_reminders.slice(0, 3).map((item) => (
                    (() => {
                      const badge = summaryBadge(item.days_until);
                      return (
                        <div key={`${item.label}-${item.renewal_due_date}`} className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500">Due on {formatDate(item.renewal_due_date || '')}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No scholarship renewal reminder is registered yet.</p>
              )}
            </div>
          </div>
        </motion.section>

        {/* Register Form */}
        <motion.section
          className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Register New Reminder</h2>
          <form onSubmit={handleRegister} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Portal</label>
              <select
                value={portal}
                onChange={e => setPortal(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all"
              >
                <option value="nsp">NSP</option>
                <option value="pmss">PMSS</option>
                <option value="csss">CSSS</option>
                <option value="minority">Minority</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Renewal Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff9933]/20 focus:border-[#ff9933] transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !dueDate}
              className="px-6 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold text-sm rounded-xl shadow-md shadow-orange-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all whitespace-nowrap"
            >
              {submitting ? 'Saving...' : 'Register'}
            </button>
          </form>
          {formMsg && (
            <p className={`mt-3 text-sm ${formMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {formMsg}
            </p>
          )}
        </motion.section>

        {/* Reminders List */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Your Reminders</h2>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-100 w-1/3 rounded mb-2"></div>
                  <div className="h-3 bg-slate-100 w-1/2 rounded"></div>
                </div>
              ))}
            </div>
          ) : reminders.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🔔</span>
              </div>
              <p className="text-slate-500">No renewal reminders registered yet.</p>
              <p className="text-xs text-slate-400 mt-1">Use the form above to set one up.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map((r, i) => {
                const days = daysUntil(r.renewal_due_date);
                const urgent = days <= 7;
                const overdue = days <= 0;
                return (
                  <motion.div
                    key={r.id}
                    className={`bg-white border rounded-xl p-4 flex items-center justify-between ${
                      overdue ? 'border-red-200 bg-red-50' : urgent ? 'border-amber-200 bg-amber-50' : 'border-slate-100'
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`text-2xl ${overdue ? 'animate-pulse' : ''}`}>
                        {overdue ? '🚨' : urgent ? '⚠️' : '🔔'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{PORTAL_LABELS[r.portal] || r.portal}</span>
                          {r.sent_at && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Sent</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Due: {formatDate(r.renewal_due_date)}
                          {' — '}
                          <span className={`font-medium ${overdue ? 'text-red-600' : urgent ? 'text-amber-600' : 'text-slate-500'}`}>
                            {overdue ? `${Math.abs(days)} days overdue` : `${days} days left`}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium"
                    >
                      Remove
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
