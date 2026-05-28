import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight, ExternalLink, ShieldCheck } from 'lucide-react';
import {
  buildCredentialByConfirmationApiPath,
  buildCredentialRecordApiPath,
  buildCredentialVerifyApiPath,
} from '@/lib/credentialApi.mjs';

interface VerificationResult {
  valid: boolean;
  revoked: boolean;
  issued_at: string | null;
  issuer: string | null;
  message: string;
}

interface CredentialData {
  credential_id: string;
  confirmation_number: string;
  phone: string;
  blockchain_tx_hash: string;
  credential_hash: string;
  ipfs_hash: string | null;
  credential_json: {
    credentialSubject?: {
      name?: string;
      scholarshipType?: string;
      amount?: number;
      confirmationNumber?: string;
    };
    issuer?: {
      name?: string;
    };
    issuanceDate?: string;
  };
  issued_at: string;
  revoked: boolean;
  network_name?: string;
  explorer_url?: string;
  polygonscan_url?: string;
}

export default function VerifyCredential() {
  const router = useRouter();
  const { id } = router.query;

  const [credential, setCredential] = useState<CredentialData | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    void fetchCredential(id as string);
  }, [id]);

  const fetchCredential = async (credentialId: string) => {
    try {
      let credentialData: CredentialData | null = null;

      const recordResponse = await fetch(buildCredentialRecordApiPath(credentialId));
      if (recordResponse.ok) {
        credentialData = (await recordResponse.json()) as CredentialData;
      } else {
        const confirmationResponse = await fetch(buildCredentialByConfirmationApiPath(credentialId));
        if (confirmationResponse.ok) {
          credentialData = (await confirmationResponse.json()) as CredentialData;
        }
      }

      if (!credentialData) {
        throw new Error('Credential not found');
      }

      setCredential(credentialData);

      const verifyResponse = await fetch(buildCredentialVerifyApiPath(credentialData.credential_id));
      if (!verifyResponse.ok) {
        throw new Error('Credential verification is unavailable');
      }

      const verifyData = await verifyResponse.json();
      setVerification(verifyData);
    } catch {
      setError('Credential not found or invalid');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const shortenHash = (hash: string) => {
    if (!hash || hash.length < 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero px-4 py-12">
        <div className="mx-auto flex max-w-2xl items-center justify-center">
          <div className="rounded-[28px] border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)]">
            <p className="text-lg font-bold text-slate-900">Verifying credential</p>
            <p className="mt-2 text-sm text-slate-500">Checking the proof record and verification status.</p>
            <div className="mt-5 h-2 w-52 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-3/5 animate-pulse rounded-full bg-gradient-to-r from-[#ff9933] to-[#e67e00]" />
            </div>
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
            <p className="text-lg font-bold text-slate-900">Verification failed</p>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link
              href="/wallet"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5"
            >
              Back to wallet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const subject = credential?.credential_json?.credentialSubject;
  const isValid = verification?.valid && !verification?.revoked && !credential?.revoked;

  return (
    <>
      <Head>
        <title>Verify Credential | GovBot</title>
      </Head>

      <div className="min-h-screen gradient-hero px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-[#ff9933] transition-colors">GovBot</Link>
            <span>/</span>
            <Link href="/wallet" className="hover:text-[#ff9933] transition-colors">Wallet</Link>
            <span>/</span>
            <span className="text-slate-600">Verify credential</span>
          </div>

          <section
            className={`rounded-[30px] border p-8 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] ${
              isValid
                ? 'border-emerald-100 bg-white'
                : 'border-red-100 bg-white'
            }`}
          >
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl ${
                isValid ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}
            >
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className={`mt-5 text-3xl font-bold ${isValid ? 'text-slate-900' : 'text-slate-900'}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {isValid ? 'Credential verified' : 'Credential not verified'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {isValid
                ? 'This scholarship credential is valid and the proof record matches the verification status.'
                : 'The credential could not be verified or has already been revoked.'}
            </p>
          </section>

          {credential && (
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Credential details</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    {subject?.scholarshipType || 'Scholarship Credential'}
                  </h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {isValid ? 'Valid proof' : 'Needs review'}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Student name</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{subject?.name || 'N/A'}</p>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Confirmation number</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{credential.confirmation_number}</p>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Issued amount</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">₹{(subject?.amount || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Issued on</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(credential.issued_at)}</p>
                </div>
              </div>

              <div className="mt-6 rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Verification record</p>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-500">Network</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {credential.network_name || 'Configured network'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-500">Transaction hash</span>
                    <a
                      href={credential.explorer_url || credential.polygonscan_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[#e67e00] hover:underline"
                    >
                      {shortenHash(credential.blockchain_tx_hash)}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-500">Credential hash</span>
                    <span className="text-sm font-semibold text-slate-900">{shortenHash(credential.credential_hash)}</span>
                  </div>
                  {credential.ipfs_hash && (
                    <div className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-slate-500">IPFS record</span>
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${credential.ipfs_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#e67e00] hover:underline"
                      >
                        {shortenHash(credential.ipfs_hash)}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">How verification works</p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>The credential record is looked up by confirmation number or credential ID.</li>
              <li>The proof status is checked against the blockchain verification endpoint.</li>
              <li>Hash references and revocation state are compared before the page marks the proof as valid.</li>
              <li>The result stays shareable through this same verification route for external reviewers.</li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
