import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sprout, ArrowLeft, ExternalLink } from 'lucide-react';
import { getErrorMessage } from '@/lib/errorMessage';

type StatusState = 'input' | 'loading' | 'result' | 'error';

interface PmKisanResult {
  status?: string;
  message?: string;
  portal_url?: string;
  reg_lookup_url?: string;
}

export default function PmKisanChecker() {
  const [state, setState] = useState<StatusState>('input');
  const [identifier, setIdentifier] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<PmKisanResult | null>(null);

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = identifier.replace(/\s/g, '');
    if (!/^\d{11,12}$/.test(val)) {
      setErrorMsg('Enter a 12-digit Aadhaar or 11-digit Registration Number.');
      return;
    }

    setState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/pm-kisan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: val }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setResult(data);
      setState('result');
    } catch (error: unknown) {
      setErrorMsg(getErrorMessage(error, 'Something went wrong'));
      setState('error');
    }
  };

  const handleReset = () => {
    setState('input');
    setIdentifier('');
    setErrorMsg('');
    setResult(null);
  };

  return (
    <>
      <Head>
        <title>PM Kisan Status | GovBot</title>
        <meta name="description" content="Check your PM Kisan beneficiary payment status" />
      </Head>

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                <Sprout className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                PM Kisan Status
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">Enter your Aadhaar or PM Kisan Registration Number</p>
            </div>

            {(state === 'input' || state === 'loading' || state === 'error') && (
              <form onSubmit={handleCheckStatus} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Aadhaar / Registration No.</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setErrorMsg(''); }}
                    placeholder="Enter 12-digit Aadhaar or 11-digit Reg No."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                    autoFocus
                  />
                </div>

                {errorMsg && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={state === 'loading' || !identifier.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl shadow-md shadow-green-200/50 hover:shadow-green-300/60 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
                >
                  {state === 'loading' ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Check Status'
                  )}
                </button>
              </form>
            )}

            {state === 'result' && result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                <div className="bg-green-50 border border-green-100 rounded-xl p-5 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {result.message}
                </div>

                <div className="space-y-3">
                  {result.portal_url && (
                    <a
                      href={result.portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl shadow-md text-sm hover:-translate-y-0.5 transition-all"
                    >
                      Check on Portal <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {result.reg_lookup_url && (
                    <a
                      href={result.reg_lookup_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:border-green-400 hover:text-green-600 transition-all"
                    >
                      Find Registration Number <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                <button
                  onClick={handleReset}
                  className="w-full py-3 px-4 bg-slate-50 border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-100 transition-colors"
                >
                  Check Another
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
