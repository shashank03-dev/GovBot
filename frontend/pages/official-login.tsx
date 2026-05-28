import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

import { OFFICIAL_SESSION_SENTINEL } from '@/lib/authSession.mjs';
import {
  OFFICIAL_SESSION_STORAGE_KEY,
  OFFICIAL_USERNAME_STORAGE_KEY,
  DEFAULT_OFFICIAL_PATH,
  sanitizeOfficialNextPath,
} from '@/lib/officialSession.mjs';

export default function OfficialLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [redirectPath, setRedirectPath] = useState(DEFAULT_OFFICIAL_PATH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const nextParam = typeof router.query.next === 'string' ? router.query.next : DEFAULT_OFFICIAL_PATH;
    const safeNextPath = sanitizeOfficialNextPath(nextParam);
    setRedirectPath(safeNextPath);

    const existingToken =
      typeof window !== 'undefined' ? window.localStorage.getItem(OFFICIAL_SESSION_STORAGE_KEY) || '' : '';
    if (existingToken) {
      void router.replace(safeNextPath);
    }
  }, [router, router.isReady, router.query.next]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/official/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.username) {
        throw new Error(payload?.detail || 'Official login failed');
      }

      window.localStorage.setItem(OFFICIAL_SESSION_STORAGE_KEY, OFFICIAL_SESSION_SENTINEL);
      window.localStorage.setItem(OFFICIAL_USERNAME_STORAGE_KEY, payload.username || username.trim());
      await router.push(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Official login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Official Login | GovBot</title>
        <meta
          name="description"
          content="Shared government-official login for accessing GovBot analytics and operations dashboards."
        />
      </Head>

      <div className="min-h-[calc(100vh-4rem)] px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/services"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#e67e00] transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Services
          </Link>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="overflow-hidden rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-teal-50 p-8 shadow-xl shadow-slate-200/60"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e67e00]">
                <ShieldCheck className="h-4 w-4" />
                Protected official access
              </div>

              <h1 className="mt-6 max-w-xl text-4xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Government dashboards now require a separate officials login.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Use the shared operations credential to monitor analytics, fraud flags, disbursement progress, and application activity without exposing these pages publicly.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  {
                    title: 'Analytics dashboard',
                    text: 'Overview, fraud review, disbursements, and regional scheme trends.',
                  },
                  {
                    title: 'Admin panel',
                    text: 'Application activity and fraud-flag review under the same official session.',
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-lg shadow-slate-200/50"
            >
              <div className="mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] text-white shadow-lg shadow-orange-200/60">
                  <LockKeyhole className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Sign in as an official
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter the shared government-operations username and password to continue.
                </p>
              </div>

              {error ? (
                <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Username</span>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-[#ff9933] focus:bg-white focus:ring-2 focus:ring-[#ff9933]/20"
                      placeholder="official username"
                      autoComplete="username"
                      disabled={loading}
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-[#ff9933] focus:bg-white focus:ring-2 focus:ring-[#ff9933]/20"
                      placeholder="shared official password"
                      autoComplete="current-password"
                      disabled={loading}
                      required
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading || !username.trim() || !password}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/50 transition hover:-translate-y-0.5 hover:shadow-orange-300/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? 'Signing in...' : 'Open official dashboard'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </motion.section>
          </div>
        </div>
      </div>
    </>
  );
}
