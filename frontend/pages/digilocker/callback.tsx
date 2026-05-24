import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Link as LinkIcon, Clock, CheckCircle, XCircle, FileText, GraduationCap, ChevronRight } from 'lucide-react';

export default function DigiLockerCallback() {
  const router = useRouter();
  const { consent_id } = router.query;

  const [status, setStatus] = useState<'loading' | 'processing' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [documents, setDocuments] = useState<string[]>([]);
  const [profileName, setProfileName] = useState<string>('');

  useEffect(() => {
    if (!consent_id) return;

    const processDigiLocker = async () => {
      try {
        // Step 1: Simulate authorization processing
        setStatus('processing');
        setProgress(20);

        // Read profile stored during DigiLocker login
        const storedProfile = typeof window !== 'undefined'
          ? localStorage.getItem('digilocker_profile')
          : null;
        const profile = storedProfile ? JSON.parse(storedProfile) : null;

        if (profile?.name) setProfileName(profile.name);

        await new Promise(resolve => setTimeout(resolve, 1200));

        // Step 2: Authorization
        setProgress(40);
        await new Promise(resolve => setTimeout(resolve, 800));

        // Step 3: Populate documents from stored profile
        setProgress(70);
        await new Promise(resolve => setTimeout(resolve, 800));

        if (profile?.docs && Array.isArray(profile.docs)) {
          setDocuments(profile.docs);
        } else {
          setDocuments(['Aadhaar Card', 'Income Certificate', 'Caste Certificate', 'Marksheet 2024']);
        }

        // Step 4: Complete
        setProgress(100);
        setStatus('success');

        // Redirect to NSP apply page after 2.5 seconds
        setTimeout(() => {
          router.push('/nsp/apply');
        }, 2500);

      } catch {
        setStatus('error');
      }
    };

    processDigiLocker();
  }, [consent_id, router]);

  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return 'Initializing DigiLocker connection...';
      case 'processing':
        if (progress < 40) return 'Authorizing with DigiLocker...';
        if (progress < 60) return 'Fetching your documents...';
        return 'Processing documents...';
      case 'success':
        return `Documents fetched for ${profileName || 'you'}! Redirecting to NSP form...`;
      case 'error':
        return 'Failed to connect DigiLocker. Please try again.';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <LinkIcon className="w-8 h-8 text-[#ff9933]" />;
      case 'processing':
        return <Clock className="w-8 h-8 text-[#0d9488] animate-pulse" />;
      case 'success':
        return <CheckCircle className="w-8 h-8 text-emerald-500" />;
      case 'error':
        return <XCircle className="w-8 h-8 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'bg-orange-50 border-orange-200 text-[#e67e00]';
      case 'processing':
        return 'bg-teal-50 border-teal-200 text-[#0d9488]';
      case 'success':
        return 'bg-emerald-50 border-emerald-200 text-emerald-600';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-600';
    }
  };

  if (!router.isReady) return null;

  if (!consent_id) {
    return (
      <>
        <Head>
          <title>DigiLocker Authorization | GovBot</title>
        </Head>
        <div className="min-h-screen gradient-hero flex flex-col">
          <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link href="/" className="flex items-center gap-2.5 group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center shadow-md shadow-orange-200/50">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    Gov<span className="text-[#ff9933]">Bot</span>
                  </span>
                </Link>
                <nav className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400">
                  <Link href="/services" className="hover:text-[#ff9933] transition-colors">Services</Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <Link href="/digilocker" className="hover:text-[#ff9933] transition-colors">DigiLocker</Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-slate-600 font-medium">Authorization</span>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1 flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-50 border-2 border-amber-200 mb-6">
                <XCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                No Active Session
              </h1>
              <p className="text-slate-500 text-sm mb-8">
                This page is reached automatically after authorizing DigiLocker. Please start the connection from the DigiLocker page.
              </p>
              <Link
                href="/digilocker"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 transition-all text-sm"
              >
                Connect DigiLocker
              </Link>
              <div className="mt-6">
                <Link href="/services" className="text-sm text-slate-400 hover:text-[#ff9933] transition-colors">
                  ← Back to Services
                </Link>
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>DigiLocker Authorization | GovBot</title>
      </Head>

      <div className="min-h-screen gradient-hero flex flex-col">
        {/* Slim Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#e67e00] flex items-center justify-center shadow-md shadow-orange-200/50">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Gov<span className="text-[#ff9933]">Bot</span>
                </span>
              </Link>
              <nav className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400">
                <Link href="/services" className="hover:text-[#ff9933] transition-colors">Services</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link href="/digilocker" className="hover:text-[#ff9933] transition-colors">DigiLocker</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-slate-600 font-medium">Authorization</span>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            {/* Header */}
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 border-2 ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                DigiLocker Authorization
              </h1>
              <p className="text-slate-500">
                Secure government document access
              </p>
            </div>

            {/* Status Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Status
                </span>
                <span className="text-sm font-mono font-semibold text-slate-700">
                  {progress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#ff9933] to-[#e67e00]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="text-slate-700 text-center text-sm">
                {getStatusMessage()}
              </p>
            </div>

            {/* Documents List */}
            {status === 'success' && documents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Documents Fetched
                </h3>
                <ul className="space-y-3">
                  {documents.map((doc, index) => (
                    <li key={index} className="flex items-center text-slate-700 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mr-3">
                        <FileText className="w-4 h-4 text-emerald-500" />
                      </div>
                      {doc}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Instructions */}
            {status === 'success' && (
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-2">
                  Your DigiLocker data is ready. Taking you to the NSP application form...
                </p>
                <p className="text-sm font-medium text-[#e67e00]">
                  ✦ Auto-fill will be available on the next page
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center">
                <button
                  onClick={() => router.reload()}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white font-semibold rounded-xl shadow-md shadow-orange-200/50 hover:shadow-orange-300/60 hover:-translate-y-0.5 transition-all"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-slate-400 text-xs">
                Powered by DigiLocker • Government of India
              </p>
              <p className="text-slate-300 text-xs mt-1">
                Demo Mode — Mock Integration
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
