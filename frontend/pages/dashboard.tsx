import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';
import StatusBadge from '@/components/StatusBadge';
import { buildBackendRequestInit } from '@/lib/backendApi.mjs';
import { mergeRealtimeActivity } from '@/lib/dashboardRealtime.mjs';
import { resolveDashboardPhone } from '@/lib/dashboardSession.mjs';
import { FileText, Clock, CheckCircle, XCircle, ExternalLink, ArrowRight, User, Zap, ChevronRight } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type Application = {
  id: string;
  service: string;
  status: 'pending' | 'submitted' | 'failed' | 'approved' | 'rejected' | 'processing';
  confirmation_number?: string;
  submitted_at: string;
};

type Activity = {
  event: string;
  timestamp: string;
};

type DashboardSummary = {
  total: number;
  submitted: number;
  pending: number;
  failed: number;
};

type DashboardSnapshot = {
  summary: DashboardSummary;
  applications: Application[];
  activities: Activity[];
  updated_at: string;
};

export default function Dashboard() {
  const [apps, setApps] = useState<Application[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    total: 0,
    submitted: 0,
    pending: 0,
    failed: 0,
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilePct, setProfilePct] = useState<number | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('govbot_token');
    if (!token) {
      router.push('/login');
      return;
    }

    const queryPhone = Array.isArray(router.query.phone) ? router.query.phone[0] : router.query.phone;
    const phone = resolveDashboardPhone({
      queryPhone,
      storedPhone: localStorage.getItem('govbot_phone') || undefined,
      token,
    });
    if (!phone) {
      setLoading(false);
      return;
    }
    localStorage.setItem('govbot_phone', phone);

    let isActive = true;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const fetchDashboard = async (background = false) => {
      try {
        if (!background && isActive) {
          setLoading(true);
        }

        const [snapshotRes, profileRes] = await Promise.all([
          fetch(`/api/live/dashboard/${encodeURIComponent(phone)}`, buildBackendRequestInit({
            headers: { Authorization: `Bearer ${token}` },
          })),
          fetch(`/api/profile/${encodeURIComponent(phone)}`, buildBackendRequestInit({
            headers: { Authorization: `Bearer ${token}` },
          })),
        ]);

        if (!isActive) {
          return;
        }

        if (snapshotRes.status === 401 || snapshotRes.status === 403) {
          localStorage.removeItem('govbot_token');
          router.push('/login');
          return;
        }

        if (snapshotRes.ok) {
          const snapshot: DashboardSnapshot = await snapshotRes.json();
          if (!isActive) {
            return;
          }
          setApps(snapshot.applications || []);
          setActivities(snapshot.activities || []);
          setSummary(snapshot.summary || { total: 0, submitted: 0, pending: 0, failed: 0 });
        }

        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (!isActive) {
            return;
          }
          setProfilePct(profile.completeness_pct ?? 0);
          setProfileName(profile.profile?.full_name || '');
        }
      } catch (err) {
        console.error('Dashboard refresh failed:', err);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        return;
      }
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        void fetchDashboard(true);
      }, 250);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    const handleWindowFocus = () => {
      scheduleRefresh();
    };

    void fetchDashboard();

    const interval = setInterval(() => {
      void fetchDashboard(true);
    }, 15000);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);

    const realtimeChannel = supabase
      ?.channel(`dashboard:${phone}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `phone=eq.${phone}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_feed', filter: `phone=eq.${phone}` },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setActivities((current) =>
              mergeRealtimeActivity(current, {
                event: String(payload.new.event || ''),
                timestamp: String(payload.new.created_at || ''),
              }),
            );
          }

          scheduleRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citizen_profiles', filter: `phone=eq.${phone}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      isActive = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      if (realtimeChannel && supabase) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [router, router.query.phone]);

  const stats = [
    { label: 'Total', value: summary.total, icon: FileText, color: '#ff9933', bg: '#fff7ed' },
    { label: 'Submitted', value: summary.submitted, icon: CheckCircle, color: '#0d9488', bg: '#f0fdfa' },
    { label: 'Pending', value: summary.pending, icon: Clock, color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Failed', value: summary.failed, icon: XCircle, color: '#ef4444', bg: '#fef2f2' },
  ];
  const newestApplication = apps[0];
  const showWaitingBanner = newestApplication && ['submitted', 'processing'].includes(newestApplication.status);

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(dateStr));
  };

  return (
    <>
      <Head>
        <title>Dashboard | GovBot</title>
        <meta name="description" content="View and manage your scholarship applications" />
      </Head>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              My Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">Track and manage your scholarship applications</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/documents"
              className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-[#e67e00] transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-100/70"
            >
              <FileText className="w-4 h-4" />
              Document Vault
            </Link>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 transition-all"
            >
              Browse Services
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Profile completeness widget */}
        {profilePct !== null && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`mb-6 rounded-2xl border p-4 flex items-center gap-4 ${
              profilePct >= 80 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
            }`}
          >
            <div className={`p-2.5 rounded-xl ${profilePct >= 80 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              <User className={`w-5 h-5 ${profilePct >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${profilePct >= 80 ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {profileName ? `${profileName.split(' ')[0]}'s Profile` : 'Citizen Profile'} — {profilePct}% complete
                </p>
                <Link
                  href="/profile"
                  className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold ${
                    profilePct >= 80 ? 'text-emerald-600 hover:text-emerald-800' : 'text-amber-600 hover:text-amber-800'
                  } transition-colors`}
                >
                  {profilePct >= 80 ? 'View Profile' : 'Complete Profile'} <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="mt-2 h-2 bg-white/60 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${profilePct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                  className={`h-full rounded-full ${profilePct >= 80 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
              </div>
              {profilePct < 80 && (
                <p className="text-xs text-amber-600 mt-1">
                  Complete your profile to enable 1-tap auto-fill on any government form
                </p>
              )}
            </div>
            <Link
              href="/form-fill"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <Zap className="w-3.5 h-3.5 text-orange-400" /> Auto-Fill Form
            </Link>
          </motion.div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: stat.bg }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: stat.color }} />
                  </div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</span>
                </div>
                <div className="text-3xl font-bold text-slate-900">
                  {loading ? '-' : <AnimatedCounter key={`${stat.label}-${stat.value}`} end={stat.value} />}
                </div>
              </motion.div>
            );
          })}
        </div>

        {showWaitingBanner && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-2xl border border-orange-100 bg-orange-50 px-5 py-4"
          >
            <p className="text-sm font-semibold text-slate-900">Application received</p>
            <p className="mt-1 text-sm text-slate-600">
              Your latest scholarship application has been added. It may take some time before it moves to the next stage and appears in downstream processing.
            </p>
          </motion.div>
        )}

        {/* Applications table */}
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent Applications</h2>
            <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">{apps.length} total</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading applications...</div>
          ) : apps.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-[#ff9933]" />
              </div>
              <p className="text-slate-500 mb-4">No applications yet</p>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#ff9933] hover:text-[#e67e00] transition-colors"
              >
                Browse Services <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Confirmation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Submitted</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{app.service}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={app.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                        {app.confirmation_number || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDate(app.submitted_at)}
                      </td>
                      <td className="px-6 py-4">
                        {app.confirmation_number && (
                          <Link
                            href={`/track/${app.confirmation_number}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#ff9933] hover:text-[#e67e00] transition-colors"
                          >
                            Track <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {activities.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <h3 className="font-semibold text-slate-900">Live Activity</h3>
              <span className="text-xs text-slate-400">from GovBot</span>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {activities.map((a, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-slate-400 text-xs whitespace-nowrap">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-slate-700">{a.event}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
}
