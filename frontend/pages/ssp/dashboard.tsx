import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

import SSPDashboard from '@/components/ssp/SSPDashboard';
import SSPPortalShell from '@/components/ssp/SSPPortalShell';
import { useSSPDraft } from '@/lib/useSSPDraft';
import { getSSPContent } from '@/lib/sspContent.mjs';

function localize(language: 'en' | 'kn', english: string, kannada: string) {
  return language === 'kn' ? kannada : english;
}

export default function SSPDashboardPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const {
    draft,
    loading,
    phone,
    language,
    setLanguage,
    studentId,
    studentName,
    syncProfile,
  } = useSSPDraft('step-1');
  const content = getSSPContent(language);

  const handleSyncProfile = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const result = await syncProfile();
      const updatedCount = result.updated_count || 0;
      setSyncMessage(
        updatedCount > 0
          ? localize(
              language,
              `${updatedCount} GovBot profile fields were added to your SSP draft.`,
              `ನಿಮ್ಮ GovBot ಪ್ರೊಫೈಲ್‌ನ ${updatedCount} ಕ್ಷೇತ್ರಗಳನ್ನು SSP ಕರಡಿಗೆ ಸೇರಿಸಲಾಗಿದೆ.`,
            )
          : localize(
              language,
              'Your SSP draft is already using the latest GovBot profile data.',
              'ನಿಮ್ಮ SSP ಕರಡು ಈಗಾಗಲೇ ಹೊಸ GovBot ಪ್ರೊಫೈಲ್ ಮಾಹಿತಿಯನ್ನು ಬಳಸುತ್ತಿದೆ.',
            ),
      );
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : localize(language, 'Could not sync your GovBot profile.', 'ನಿಮ್ಮ GovBot ಪ್ರೊಫೈಲ್ ಸಿಂಕ್ ಆಗಲಿಲ್ಲ.'),
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Head>
        <title>SSP Dashboard | GovBot</title>
        <meta name="description" content="SSP student dashboard with the full five-step scholarship journey." />
      </Head>

      <SSPPortalShell
        language={language}
        onLanguageChange={setLanguage}
        studentName={studentName}
        studentId={studentId}
        title={content.portalName}
        subtitle={content.dashboard.title}
        showStudentBar={Boolean(phone)}
      >
        {loading ? (
          <div className="mt-10 rounded-[14px] border border-[#d9dee3] bg-white px-8 py-10 text-center shadow-[0_12px_24px_rgba(0,0,0,0.04)]">
            <div className="text-xl text-[#5d6d78]">Loading SSP dashboard...</div>
          </div>
        ) : !phone ? (
          <div className="mt-10 rounded-[14px] border border-[#d9dee3] bg-white px-8 py-10 text-center shadow-[0_12px_24px_rgba(0,0,0,0.04)]">
            <h1 className="text-2xl font-semibold text-[#23445a]">Login required to continue the SSP flow</h1>
            <p className="mt-4 text-sm text-[#5e6c76]">Use your GovBot login so we can load your saved profile and draft data.</p>
            <div className="mt-6 flex justify-center gap-4">
              <Link href="/login?next=%2Fssp%2Fdashboard" className="bg-[#59b84f] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white">
                Login
              </Link>
              <Link href="/ssp" className="border border-[#b8c7d2] bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#30556d]">
                Back to portal
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-10 rounded-[8px] border border-[#d9e3ec] bg-white px-6 py-5 shadow-[0_10px_18px_rgba(0,0,0,0.03)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#3d7fbb]">
                    {localize(language, 'GovBot Profile Sync', 'GovBot ಪ್ರೊಫೈಲ್ ಸಿಂಕ್')}
                  </div>
                  <h1 className="mt-2 text-[24px] font-semibold text-[#3b4d59]">
                    {localize(language, 'Auto-add your filled profile into the SSP application.', 'ನಿಮ್ಮ ಭರ್ತಿಯಾದ ಪ್ರೊಫೈಲ್ ಅನ್ನು SSP ಅರ್ಜಿಗೆ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸೇರಿಸಿ.')}
                  </h1>
                  <p className="mt-2 text-sm text-[#62727d]">
                    {localize(
                      language,
                      'Use your saved GovBot profile, DigiLocker review, and synced data to refresh this SSP draft before you continue.',
                      'ಮುಂದುವರಿಸುವ ಮೊದಲು ಈ SSP ಕರಡನ್ನು ನಿಮ್ಮ ಸಂರಕ್ಷಿತ GovBot ಪ್ರೊಫೈಲ್, DigiLocker ಪರಿಶೀಲನೆ ಮತ್ತು ಸಿಂಕ್ ಮಾಡಿದ ಮಾಹಿತಿಯಿಂದ ನವೀಕರಿಸಿ.',
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/profile" className="border border-[#c3d2dc] bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#31566f]">
                    {localize(language, 'Manage Profile', 'ಪ್ರೊಫೈಲ್ ನಿರ್ವಹಿಸಿ')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSyncProfile()}
                    disabled={syncing}
                    className="bg-[#59b84f] px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {syncing ? localize(language, 'Adding Profile...', 'ಪ್ರೊಫೈಲ್ ಸೇರಲಾಗುತ್ತಿದೆ...') : localize(language, 'Add My Profile To SSP', 'ನನ್ನ ಪ್ರೊಫೈಲ್ ಅನ್ನು SSP ಗೆ ಸೇರಿಸಿ')}
                  </button>
                </div>
              </div>
              {syncMessage ? (
                <div className="mt-4 border border-[#cde7cf] bg-[#f4fff4] px-4 py-3 text-sm font-semibold text-[#2e8b57]">
                  {syncMessage}
                </div>
              ) : null}
              {syncError ? (
                <div className="mt-4 border border-[#efc0c0] bg-[#fff4f4] px-4 py-3 text-sm font-semibold text-[#b62d2d]">
                  {syncError}
                </div>
              ) : null}
            </div>

            <SSPDashboard language={language} fields={draft.fields} />
          </>
        )}
      </SSPPortalShell>
    </>
  );
}
