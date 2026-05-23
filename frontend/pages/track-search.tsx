import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, ArrowLeft } from 'lucide-react';
import { buildDashboardLoginHref, buildTrackHref } from '@/lib/navigationLinks.mjs';

export default function TrackSearch() {
  const [confirmationNo, setConfirmationNo] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = confirmationNo.trim();
    if (!val) { setError('Please enter a confirmation number'); return; }
    router.push(buildTrackHref(val));
  }

  return (
    <>
      <Head>
        <title>Track Application | GovBot</title>
        <meta name="description" content="Track your scholarship application status by confirmation number" />
      </Head>

      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-10">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-blue-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Track Application
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">Enter your confirmation number to check status</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmation Number</label>
                <input
                  type="text"
                  value={confirmationNo}
                  onChange={e => { setConfirmationNo(e.target.value); setError(''); }}
                  placeholder="e.g. NSP2026XXXXXX"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase tracking-wider"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
              )}

              <button
                type="submit"
                disabled={!confirmationNo.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-md shadow-blue-200/50 hover:shadow-blue-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
              >
                <Search className="w-4 h-4" />
                Track Status
              </button>
            </form>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-sm">
            <Link href="/services" className="flex items-center gap-1.5 text-slate-500 hover:text-[#ff9933] transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> All Services
            </Link>
            <Link href={buildDashboardLoginHref()} className="text-slate-500 hover:text-[#ff9933] transition-colors">
              My Dashboard
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  );
}
