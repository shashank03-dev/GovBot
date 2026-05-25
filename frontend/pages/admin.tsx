import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, LogOut } from 'lucide-react';

import StatusBadge from '@/components/StatusBadge';
import { fetchOfficialJson, logoutOfficialSession } from '@/lib/officialApi';
import { useOfficialRouteGuard } from '@/lib/useOfficialRouteGuard';

type Application = {
  id: string;
  phone: string;
  service: string;
  status: 'pending' | 'submitted' | 'failed';
  submitted_at: string;
};

type FraudFlag = {
  id: string;
  aadhaar_hash: string;
  phones: string[];
  portal: string;
  flagged_at: string;
};

type AdminDashboardResponse = {
  applications: Application[];
  fraud_flags: FraudFlag[];
};

export default function AdminDashboard() {
  const router = useRouter();
  const { isAuthorized, isChecking } = useOfficialRouteGuard();
  const [applications, setApplications] = useState<Application[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'applications' | 'fraud'>('applications');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [mutatingFraudId, setMutatingFraudId] = useState('');

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let active = true;

    const loadAdminDashboard = async () => {
      try {
        const payload = await fetchOfficialJson<AdminDashboardResponse>(router, '/api/admin/dashboard');
        if (active) {
          setApplications(payload.applications || []);
          setFraudFlags(payload.fraud_flags || []);
          setLastRefreshed(new Date());
        }
      } catch (error) {
        console.error('Error fetching admin dashboard:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadAdminDashboard();
    const timer = setInterval(() => {
      void loadAdminDashboard();
    }, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAuthorized, router]);

  const clearFraudFlag = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to clear this fraud flag? This action cannot be undone.',
    );
    if (!confirmed) {
      return;
    }

    setMutatingFraudId(id);

    try {
      await fetchOfficialJson<{ cleared: boolean; id: string }>(
        router,
        `/api/admin/fraud-flags/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      setFraudFlags((current) => current.filter((flag) => flag.id !== id));
    } catch (error) {
      console.error('Error clearing fraud flag:', error);
    } finally {
      setMutatingFraudId('');
    }
  };

  const handleOfficialLogout = () => {
    logoutOfficialSession(router);
  };

  const totalApplications = applications.length;
  const submittedCount = applications.filter((app) => app.status === 'submitted').length;
  const failedCount = applications.filter((app) => app.status === 'failed').length;
  const fraudCount = fraudFlags.length;

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const last4 = cleanPhone.slice(-4);
    return `****${last4}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(ist.getUTCDate())}/${pad(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()}, ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
  };

  const formatTimestamp = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  if (isChecking || !isAuthorized || loading) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center px-4">
        <div className="rounded-2xl border border-orange-100 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">Loading official admin workspace</p>
          <p className="mt-2 text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Verifying access and preparing the latest operations snapshot...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Dashboard | GovBot</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#e67e00] transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Services
          </Link>
          <button
            onClick={handleOfficialLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Admin Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Auto-refreshing every 30s {lastRefreshed && `• Last: ${formatTimestamp(lastRefreshed)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fraudCount > 0 && (
              <span className="bg-red-100 text-red-700 px-3 py-1.5 text-sm font-bold rounded-full">
                🚨 {fraudCount}
              </span>
            )}
            <span className="bg-green-100 text-green-700 px-3 py-1.5 text-sm font-bold rounded-full">
              {totalApplications} apps
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <button onClick={() => setActiveTab('applications')} className="bg-white border border-slate-100 rounded-2xl p-5 text-left shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Applications</div>
            <div className="text-3xl font-bold text-slate-900">{totalApplications}</div>
          </button>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Submitted</div>
            <div className="text-3xl font-bold text-green-600">{submittedCount}</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Failed</div>
            <div className="text-3xl font-bold text-red-500">{failedCount}</div>
          </div>
          <button onClick={() => setActiveTab('fraud')} className={`bg-white border rounded-2xl p-5 text-left shadow-sm hover:shadow-md transition-shadow ${fraudCount > 0 ? 'border-red-200' : 'border-slate-100'}`}>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fraud Flags</div>
            <div className={`text-3xl font-bold ${fraudCount > 0 ? 'text-red-500' : 'text-green-600'}`}>{fraudCount}</div>
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
          <button
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'applications' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('applications')}
          >
            Applications
          </button>
          <button
            className={`px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'fraud' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('fraud')}
          >
            Fraud Flags
            {fraudCount > 0 && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 text-xs rounded-full">{fraudCount}</span>}
          </button>
        </div>

        {activeTab === 'applications' && (
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-100">
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Phone</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Service</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Status</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {applications.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-slate-400">
                        No applications yet
                      </td>
                    </tr>
                  ) : (
                    applications.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-sm text-slate-600 font-mono">{formatPhone(app.phone)}</td>
                        <td className="px-5 py-3.5 text-sm text-slate-900 font-medium">{app.service}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={app.status} size="sm" />
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(app.submitted_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'fraud' && (
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-red-50 text-red-600 uppercase text-xs border-b border-red-100">
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Aadhaar Hash</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Phone Numbers</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Portal</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Flagged At</th>
                    <th className="px-5 py-3.5 text-left font-semibold tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fraudFlags.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        No fraud flags detected — all applications are from unique Aadhaar numbers
                      </td>
                    </tr>
                  ) : (
                    fraudFlags.map((flag) => (
                      <tr key={flag.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                          {flag.aadhaar_hash.slice(-8)}...
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {flag.phones.map((phone, idx) => (
                              <span key={idx} className="bg-red-100 text-red-700 px-2 py-0.5 text-xs rounded-full font-medium">
                                {formatPhone(phone)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 text-xs rounded-full font-medium">
                            {flag.portal || 'nsp'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-500">
                          {formatDate(flag.flagged_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => clearFraudFlag(flag.id)}
                            disabled={mutatingFraudId === flag.id}
                            className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 text-xs font-semibold rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mutatingFraudId === flag.id ? 'Clearing...' : 'Clear Flag'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
