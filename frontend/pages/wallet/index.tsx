import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Landmark, ShieldCheck, WalletCards } from 'lucide-react';
import CredentialCard from '@/components/CredentialCard';
import AnimatedCounter from '@/components/AnimatedCounter';

interface Credential {
  credential_id: string;
  confirmation_number: string;
  scholarship_type: string;
  amount: number;
  issued_at: string;
  revoked: boolean;
  verify_url: string;
}

interface WalletData {
  phone: string;
  total_credentials: number;
  credentials: Credential[];
  total_amount: number;
}

export default function CredentialWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const phone = localStorage.getItem('govbot_phone');
    if (!phone) {
      window.location.href = '/login';
      return;
    }

    void fetchWalletData(phone);
  }, []);

  const fetchWalletData = async (phone: string) => {
    try {
      const response = await fetch(`/api/credentials/${phone}`);
      const data = await response.json();

      if (data.credentials) {
        const total = data.credentials.reduce((sum: number, credential: Credential) => sum + credential.amount, 0);
        setWallet({
          phone: data.phone,
          total_credentials: data.total,
          credentials: data.credentials,
          total_amount: total,
        });
      }
    } catch {
      setError('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero px-4 py-12">
        <div className="mx-auto flex max-w-2xl items-center justify-center">
          <div className="rounded-[28px] border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)]">
            <p className="text-sm font-semibold text-slate-900">Loading credential wallet...</p>
            <p className="mt-2 text-sm text-slate-500">Fetching issued proof links and scholarship records.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen gradient-hero px-4 py-12">
        <div className="mx-auto flex max-w-2xl items-center justify-center">
          <div className="rounded-[28px] border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)]">
            <p className="text-lg font-bold text-slate-900">Credential wallet unavailable</p>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5"
            >
              Back to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Credentials | GovBot</title>
      </Head>

      <div className="min-h-screen gradient-hero px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-[#ff9933] transition-colors">GovBot</Link>
            <span>/</span>
            <Link href="/dashboard" className="hover:text-[#ff9933] transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-600">Credential wallet</span>
          </div>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#e67e00]">
                  <WalletCards className="h-3.5 w-3.5" />
                  Wallet
                </div>
                <h1 className="mt-4 text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Credential Wallet
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Scholarship credentials, verification links, and issued proof records in the same visual system as the rest of GovBot.
                </p>
              </div>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
              >
                Back to dashboard
              </Link>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <motion.div
                className="rounded-[26px] border border-orange-100 bg-orange-50 p-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">Total credentials</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  <AnimatedCounter end={wallet?.total_credentials || 0} />
                </p>
                <p className="mt-2 text-sm text-slate-500">Issued records available for verification.</p>
              </motion.div>

              <motion.div
                className="rounded-[26px] border border-emerald-100 bg-emerald-50 p-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.08 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Total scholarship value</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  <AnimatedCounter
                    end={wallet?.total_amount || 0}
                    prefix="₹"
                    formatter={(value) => Math.round(value).toLocaleString('en-IN')}
                  />
                </p>
                <p className="mt-2 text-sm text-slate-500">Combined amount across issued credentials.</p>
              </motion.div>

              <motion.div
                className="rounded-[26px] border border-sky-100 bg-sky-50 p-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.16 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Verification network</p>
                <p className="mt-3 text-xl font-bold text-slate-900">Polygon Mumbai</p>
                <p className="mt-2 text-sm text-slate-500">Proof links and verification remain ready to share.</p>
              </motion.div>
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Issued credentials
                </h2>
                <p className="mt-1 text-sm text-slate-500">Each card keeps the proof link, amount, and issuance details in one place.</p>
              </div>
            </div>

            {wallet?.credentials && wallet.credentials.length > 0 ? (
              <motion.div
                className="mt-6 space-y-6"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
                }}
              >
                {wallet.credentials.map((credential) => (
                  <motion.div
                    key={credential.credential_id}
                    variants={{
                      hidden: { opacity: 0, y: 18 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.35 }}
                  >
                    <CredentialCard credential={credential} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-12 text-center">
                <p className="text-lg font-bold text-slate-900">No credentials issued yet</p>
                <p className="mt-2 text-sm text-slate-500">
                  Submit a scholarship application first and the issued credential will appear here once available.
                </p>
                <Link
                  href="/nsp/apply"
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5"
                >
                  Start application
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[26px] border border-slate-100 bg-slate-50 p-5">
                <ShieldCheck className="h-5 w-5 text-[#e67e00]" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Proof that is shareable</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Every record can be opened through a verification page instead of relying on screenshots or manual trust.
                </p>
              </div>
              <div className="rounded-[26px] border border-slate-100 bg-slate-50 p-5">
                <CheckCircle2 className="h-5 w-5 text-[#0d9488]" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Consistent with dashboard</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Wallet, dashboard, tracking, and application flows now share the same light GOVbot interface language.
                </p>
              </div>
              <div className="rounded-[26px] border border-slate-100 bg-slate-50 p-5">
                <Landmark className="h-5 w-5 text-sky-600" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Ready for demo handoff</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Open a credential, copy the verification link, and move directly into the proof flow without a visual theme break.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
