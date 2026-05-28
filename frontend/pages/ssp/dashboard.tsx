import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import SSPDashboard from '@/components/ssp/SSPDashboard';
import SSPPortalShell from '@/components/ssp/SSPPortalShell';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import { buildPortalDocumentChecklist } from '@/lib/documentVault.mjs';
import { useSSPDraft } from '@/lib/useSSPDraft';
import { getSSPContent } from '@/lib/sspContent.mjs';
import {
  buildGovBotSSPApplyAnimationSteps,
  buildGovBotSSPApplyFields,
  hasSSPApplySession,
  shouldShowSSPShowcaseFallbackNotice,
} from '@/lib/sspDraft.mjs';
import { buildTrackHref } from '@/lib/navigationLinks.mjs';

function localize(language: 'en' | 'kn', english: string, kannada: string) {
  return language === 'kn' ? kannada : english;
}

type SSPAnimationStep = {
  stepId: string;
  title: string;
  description: string;
  fields: Record<string, unknown>;
  entries: Array<{
    name: string;
    label: string;
    value: unknown;
  }>;
};

type DemoState = 'idle' | 'running' | 'submitting' | 'needs_documents' | 'done';
type VaultDocument = {
  id?: string;
  doc_type?: string;
  custom_label?: string | null;
  source?: string;
  status?: string;
  verification_status?: string;
};
type DocumentChecklistItem = {
  docType: string;
  label: string;
  required: boolean;
  status: 'ready' | 'needs_review' | 'missing';
  document: VaultDocument | null;
};
type PortalDocumentChecklist = {
  items: DocumentChecklistItem[];
  missingRequiredDocuments: DocumentChecklistItem[];
  reviewRequiredDocuments: DocumentChecklistItem[];
  readyRequiredDocuments: DocumentChecklistItem[];
  isComplete: boolean;
};

const SSP_ANIMATION_DELAY_MS = 850;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDocumentNames(items: DocumentChecklistItem[]) {
  return items.map((item) => item.label).join(', ');
}

export default function SSPDashboardPage() {
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [applyError, setApplyError] = useState('');
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [activeAnimationIndex, setActiveAnimationIndex] = useState(-1);
  const [animatedFields, setAnimatedFields] = useState<Record<string, unknown>>({});
  const [animationLog, setAnimationLog] = useState<Array<{ title: string; done: boolean }>>([]);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [showShowcaseNotice, setShowShowcaseNotice] = useState(false);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [documentFetchState, setDocumentFetchState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable' | 'error'>('idle');
  const [documentFetchError, setDocumentFetchError] = useState('');
  const [documentGateMessage, setDocumentGateMessage] = useState('');
  const {
    draft,
    error,
    loading,
    phone,
    token,
    language,
    setLanguage,
    studentId,
    studentName,
    submitDraft,
  } = useSSPDraft('step-1');
  const content = getSSPContent(language);
  const hasApplySession = hasSSPApplySession(phone, token, error);
  const animationSteps = useMemo(
    () => buildGovBotSSPApplyAnimationSteps(draft.fields) as SSPAnimationStep[],
    [draft.fields],
  );
  const documentChecklist = useMemo(
    () => buildPortalDocumentChecklist('ssp', vaultDocuments) as PortalDocumentChecklist,
    [vaultDocuments],
  );
  const needsShowcaseNotice = useMemo(() => shouldShowSSPShowcaseFallbackNotice(draft.fields), [draft.fields]);
  const currentAnimationStep = activeAnimationIndex >= 0 ? animationSteps[activeAnimationIndex] : null;
  const dashboardFields = demoState === 'idle' ? draft.fields : { ...draft.fields, ...animatedFields };

  const loadVaultDocuments = useCallback(async () => {
    if (!phone || !token) {
      setVaultDocuments([]);
      setDocumentFetchState('unavailable');
      setDocumentFetchError('');
      return [] as VaultDocument[];
    }

    setDocumentFetchState('loading');
    setDocumentFetchError('');

    try {
      const response = await fetch(
        buildProxyApiPath(`documents/${encodeURIComponent(phone)}`),
        buildBackendRequestInit({
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.detail === 'string' ? payload.detail : `Document fetch failed with ${response.status}`);
      }
      const documents = Array.isArray(payload?.documents) ? payload.documents as VaultDocument[] : [];
      setVaultDocuments(documents);
      setDocumentFetchState('loaded');
      return documents;
    } catch (error: unknown) {
      setVaultDocuments([]);
      setDocumentFetchState('error');
      setDocumentFetchError(
        error instanceof Error ? error.message : localize(language, 'Could not fetch saved documents.', 'ಉಳಿಸಿದ ದಾಖಲೆಗಳನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'),
      );
      return [] as VaultDocument[];
    }
  }, [language, phone, token]);

  useEffect(() => {
    if (!hasApplySession) return;
    void loadVaultDocuments();
  }, [hasApplySession, loadVaultDocuments]);

  const submitCompletedDraft = async (finalFields: Record<string, unknown>) => {
    const result = await submitDraft({
      current_step: 'step-5',
      fields: finalFields,
      submission_status: draft.confirmation_number ? draft.submission_status : 'draft',
      confirmation_number: draft.confirmation_number,
    });
    const confirmationNumber = result.confirmation_number || result.draft.confirmation_number;
    setAnimatedFields(finalFields);
    setAnimationProgress(100);
    setDemoState('done');
    setApplyMessage(
      localize(
        language,
        `SSP application submitted. Tracking and dashboard data are updated for ${confirmationNumber}.`,
        `SSP ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿದೆ. ${confirmationNumber} ಗಾಗಿ ಟ್ರ್ಯಾಕಿಂಗ್ ಮತ್ತು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮಾಹಿತಿ ನವೀಕರಿಸಲಾಗಿದೆ.`,
      ),
    );
  };

  const checkDocumentsBeforeSubmit = async () => {
    const latestDocuments = await loadVaultDocuments();
    const latestChecklist = buildPortalDocumentChecklist('ssp', latestDocuments) as PortalDocumentChecklist;
    if (latestChecklist.isComplete) {
      setDocumentGateMessage('');
      return true;
    }

    const missingNames = formatDocumentNames(latestChecklist.missingRequiredDocuments);
    const reviewNames = formatDocumentNames(latestChecklist.reviewRequiredDocuments);
    const problemParts = [
      missingNames ? `Missing: ${missingNames}` : '',
      reviewNames ? `Needs review: ${reviewNames}` : '',
    ].filter(Boolean);

    setDemoState('needs_documents');
    setAnimationProgress(96);
    setDocumentGateMessage(
      `${problemParts.join('. ')}. Please add or correct these documents, then press Submit again.`,
    );
    return false;
  };

  const handleSubmitAfterDocuments = async () => {
    if (applying) return;
    setApplying(true);
    setApplyError('');
    setApplyMessage('');
    setDocumentGateMessage('');

    try {
      setDemoState('submitting');
      setAnimationProgress(92);
      const canSubmit = await checkDocumentsBeforeSubmit();
      if (!canSubmit) return;
      await submitCompletedDraft(buildGovBotSSPApplyFields(draft.fields));
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : localize(language, 'Could not submit the SSP application.', 'SSP ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸಲಾಗಲಿಲ್ಲ.'),
      );
    } finally {
      setApplying(false);
    }
  };

  const handleWatchGovBotApply = async () => {
    if (applying) return;

    setApplying(true);
    setApplyError('');
    setApplyMessage('');
    setDocumentGateMessage('');
    setDemoState('running');
    setActiveAnimationIndex(-1);
    setAnimatedFields({});
    setAnimationProgress(0);
    setShowShowcaseNotice(false);
    setAnimationLog(animationSteps.map((step) => ({ title: step.title, done: false })));

    try {
      const finalFields = buildGovBotSSPApplyFields(draft.fields);

      for (const [index, step] of animationSteps.entries()) {
        setActiveAnimationIndex(index);
        await wait(SSP_ANIMATION_DELAY_MS);
        setAnimatedFields((currentFields) => ({ ...currentFields, ...step.fields }));
        setAnimationLog((currentLog) =>
          currentLog.map((item, itemIndex) => (itemIndex === index ? { ...item, done: true } : item)),
        );
        setAnimationProgress(Math.round(((index + 1) / (animationSteps.length + 1)) * 100));
      }

      setDemoState('submitting');
      setActiveAnimationIndex(animationSteps.length);
      setAnimationProgress(needsShowcaseNotice ? 88 : 92);
      if (needsShowcaseNotice) {
        setShowShowcaseNotice(true);
        await wait(1400);
      }
      const canSubmit = await checkDocumentsBeforeSubmit();
      if (!canSubmit) return;
      setAnimationProgress(92);
      await wait(500);

      await submitCompletedDraft(finalFields);
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : localize(language, 'Could not submit the SSP application.', 'SSP ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸಲಾಗಲಿಲ್ಲ.'),
      );
      setDemoState('idle');
      setAnimationProgress(0);
      setActiveAnimationIndex(-1);
      setShowShowcaseNotice(false);
      setDocumentGateMessage('');
    } finally {
      setApplying(false);
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
        showStudentBar={hasApplySession}
      >
        {loading ? (
          <div className="mt-10 rounded-[14px] border border-[#d9dee3] bg-white px-8 py-10 text-center shadow-[0_12px_24px_rgba(0,0,0,0.04)]">
            <div className="text-xl text-[#5d6d78]">Loading SSP dashboard...</div>
          </div>
        ) : !hasApplySession ? (
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
                    {localize(language, 'GovBot Apply', 'GovBot ಅರ್ಜಿ')}
                  </div>
                  <h1 className="mt-2 text-[24px] font-semibold text-[#3b4d59]">
                    {localize(language, 'Watch GovBot apply through SSP with complete tracking.', 'ಸಂಪೂರ್ಣ ಟ್ರ್ಯಾಕಿಂಗ್‌ನೊಂದಿಗೆ GovBot SSP ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸುವುದನ್ನು ನೋಡಿ.')}
                  </h1>
                  <p className="mt-2 text-sm text-[#62727d]">
                    {localize(
                      language,
                      'One action fills the SSP draft, submits it, creates the tracking number, and refreshes this dashboard with the submitted data.',
                      'ಒಂದು ಕ್ರಿಯೆಯು SSP ಕರಡನ್ನು ಭರ್ತಿ ಮಾಡಿ, ಸಲ್ಲಿಸಿ, ಟ್ರ್ಯಾಕಿಂಗ್ ಸಂಖ್ಯೆಯನ್ನು ರಚಿಸಿ, ಸಲ್ಲಿಸಿದ ಮಾಹಿತಿಯಿಂದ ಈ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಅನ್ನು ನವೀಕರಿಸುತ್ತದೆ.',
                    )}
                  </p>
                  {draft.confirmation_number ? (
                    <Link href={buildTrackHref(draft.confirmation_number)} className="mt-3 inline-flex text-sm font-bold text-[#c22564] underline">
                      {localize(language, `Track ${draft.confirmation_number}`, `${draft.confirmation_number} ಟ್ರ್ಯಾಕ್ ಮಾಡಿ`)}
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/profile" className="border border-[#c3d2dc] bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#31566f]">
                    {localize(language, 'Manage Profile', 'ಪ್ರೊಫೈಲ್ ನಿರ್ವಹಿಸಿ')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleWatchGovBotApply()}
                    disabled={applying}
                    className="bg-[#59b84f] px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {applying ? localize(language, 'Applying...', 'ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...') : localize(language, '▶ Watch GovBot Apply', '▶ GovBot ಅರ್ಜಿ ನೋಡಿ')}
                  </button>
                </div>
              </div>
              <div className="mt-5 border border-[#d7e4ec] bg-[#fbfdff] px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3d7fbb]">
                      {localize(language, 'Document packet', 'ದಾಖಲೆ ಪ್ಯಾಕೆಟ್')}
                    </div>
                    <p className="mt-1 text-sm text-[#62727d]">
                      {documentFetchState === 'loading'
                        ? localize(language, 'Fetching saved documents from GovBot vault...', 'GovBot ವಾಲ್ಟ್‌ನಿಂದ ಉಳಿಸಿದ ದಾಖಲೆಗಳನ್ನು ಪಡೆಯಲಾಗುತ್ತಿದೆ...')
                        : documentFetchState === 'unavailable'
                          ? localize(language, 'Login is required to fetch actual saved documents.', 'ನಿಜವಾದ ಉಳಿಸಿದ ದಾಖಲೆಗಳನ್ನು ಪಡೆಯಲು ಲಾಗಿನ್ ಅಗತ್ಯವಿದೆ.')
                          : documentFetchState === 'error'
                            ? documentFetchError || localize(language, 'Could not fetch saved documents.', 'ಉಳಿಸಿದ ದಾಖಲೆಗಳನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.')
                            : localize(
                                language,
                                `${documentChecklist.readyRequiredDocuments.length}/${documentChecklist.items.length} required documents fetched and ready.`,
                                `${documentChecklist.readyRequiredDocuments.length}/${documentChecklist.items.length} ಅಗತ್ಯ ದಾಖಲೆಗಳು ಸಿದ್ಧವಾಗಿವೆ.`,
                              )}
                    </p>
                  </div>
                  <Link href="/documents" className="border border-[#c3d2dc] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#31566f]">
                    {localize(language, 'Manage Documents', 'ದಾಖಲೆ ನಿರ್ವಹಿಸಿ')}
                  </Link>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  {documentChecklist.items.map((item) => (
                    <div key={item.docType} className="border border-[#dfe7ee] bg-white px-3 py-2 text-xs">
                      <div className="font-semibold text-[#324c5e]">{item.label}</div>
                      <div className={`mt-1 font-bold ${
                        item.status === 'ready'
                          ? 'text-[#2e8b57]'
                          : item.status === 'needs_review'
                            ? 'text-[#a36b00]'
                            : 'text-[#b62d2d]'
                      }`}>
                        {item.status === 'ready'
                          ? localize(language, 'Fetched', 'ಪಡೆಯಲಾಗಿದೆ')
                          : item.status === 'needs_review'
                            ? localize(language, 'Review needed', 'ಪರಿಶೀಲನೆ ಬೇಕು')
                            : localize(language, 'Missing', 'ಕಾಣೆಯಾಗಿದೆ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {demoState !== 'idle' ? (
                <div className="mt-5 border border-[#c8dbe7] bg-[#f8fbfd] px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#3d7fbb]">
                        {demoState === 'running'
                          ? localize(language, 'Live SSP form fill', 'ಲೈವ್ SSP ಫಾರ್ಮ್ ಭರ್ತಿ')
                          : demoState === 'submitting'
                            ? localize(language, 'Submitting SSP form', 'SSP ಫಾರ್ಮ್ ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ')
                            : demoState === 'needs_documents'
                              ? localize(language, 'Documents needed', 'ದಾಖಲೆಗಳು ಬೇಕು')
                              : localize(language, 'SSP form submitted', 'SSP ಫಾರ್ಮ್ ಸಲ್ಲಿಸಲಾಗಿದೆ')}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[#30485a]">
                        {demoState === 'submitting'
                          ? localize(language, 'Final declaration accepted. Sending to SSP...', 'ಅಂತಿಮ ಘೋಷಣೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. SSP ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ...')
                          : demoState === 'needs_documents'
                            ? localize(language, 'Required documents are missing before final submit.', 'ಅಂತಿಮ ಸಲ್ಲಿಕೆಗೆ ಮೊದಲು ಅಗತ್ಯ ದಾಖಲೆಗಳು ಕಾಣೆಯಾಗಿವೆ.')
                            : currentAnimationStep?.title || localize(language, 'Application submitted', 'ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿದೆ')}
                      </div>
                      <p className="mt-1 text-sm text-[#62727d]">
                        {demoState === 'submitting'
                          ? localize(language, 'GovBot is creating the confirmation number and dashboard tracking row.', 'GovBot ದೃಢೀಕರಣ ಸಂಖ್ಯೆ ಮತ್ತು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಟ್ರ್ಯಾಕಿಂಗ್ ಸಾಲನ್ನು ರಚಿಸುತ್ತಿದೆ.')
                          : demoState === 'needs_documents'
                            ? localize(language, 'Ask the user to upload or correct the missing documents, then submit again.', 'ಬಳಕೆದಾರರಿಗೆ ಕಾಣೆಯಾದ ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಅಥವಾ ಸರಿಪಡಿಸಲು ಹೇಳಿ, ನಂತರ ಮತ್ತೆ ಸಲ್ಲಿಸಿ.')
                            : currentAnimationStep?.description || localize(language, 'Tracking is ready for this SSP application.', 'ಈ SSP ಅರ್ಜಿಗೆ ಟ್ರ್ಯಾಕಿಂಗ್ ಸಿದ್ಧವಾಗಿದೆ.')}
                      </p>
                    </div>
                    <div className="min-w-[170px] text-right">
                      <div className="text-[28px] font-bold text-[#27748d]">{animationProgress}%</div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[#7a8b96]">
                        {localize(language, 'Progress', 'ಪ್ರಗತಿ')}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden bg-[#e5eef4]">
                    <div
                      className="h-full bg-[#59b84f] transition-all duration-300"
                      style={{ width: `${animationProgress}%` }}
                    />
                  </div>
                  {showShowcaseNotice ? (
                    <div className="mt-4 border border-[#e5c46c] bg-[#fff8df] px-4 py-3 text-sm leading-relaxed text-[#6d5612]">
                      <span className="font-bold">
                        {localize(language, 'Showcase notice:', 'ಪ್ರದರ್ಶನ ಸೂಚನೆ:')}
                      </span>{' '}
                      {localize(
                        language,
                        'No saved SSP fields were found, so GovBot is using clearly marked sample data before completing this demo submission.',
                        'ಉಳಿಸಿದ SSP ಕ್ಷೇತ್ರಗಳು ಕಂಡುಬಂದಿಲ್ಲ, ಆದ್ದರಿಂದ ಈ ಡೆಮೊ ಸಲ್ಲಿಕೆಯನ್ನು ಪೂರ್ಣಗೊಳಿಸುವ ಮೊದಲು GovBot ಸ್ಪಷ್ಟವಾಗಿ ಗುರುತಿಸಿದ ಮಾದರಿ ಮಾಹಿತಿಯನ್ನು ಬಳಸುತ್ತಿದೆ.',
                      )}
                    </div>
                  ) : null}
                  {documentGateMessage ? (
                    <div className="mt-4 border border-[#e5c46c] bg-[#fff8df] px-4 py-3 text-sm leading-relaxed text-[#6d5612]">
                      <span className="font-bold">
                        {localize(language, 'Action needed:', 'ಕ್ರಮ ಅಗತ್ಯವಿದೆ:')}
                      </span>{' '}
                      {documentGateMessage}
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Link href="/documents" className="border border-[#caa447] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#6d5612]">
                          {localize(language, 'Upload missing documents', 'ಕಾಣೆಯಾದ ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleSubmitAfterDocuments()}
                          disabled={applying}
                          className="bg-[#59b84f] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {localize(language, 'I added documents — submit again', 'ದಾಖಲೆಗಳನ್ನು ಸೇರಿಸಲಾಗಿದೆ — ಮತ್ತೆ ಸಲ್ಲಿಸಿ')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {currentAnimationStep && demoState === 'running' ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {currentAnimationStep.entries.map((entry) => (
                        <div key={entry.name} className="border border-[#d7e4ec] bg-white px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7b8d98]">{entry.label}</div>
                          <div className="mt-1 min-h-6 text-sm font-semibold text-[#324c5e]">
                            {entry.value === true ? 'Accepted' : String(entry.value || '—')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-5 grid gap-2 md:grid-cols-5">
                    {animationLog.map((item, index) => {
                      const active = index === activeAnimationIndex && demoState === 'running';
                      return (
                        <div
                          key={item.title}
                          className={`border px-3 py-3 text-xs font-semibold transition-colors ${
                            item.done
                              ? 'border-[#cde7cf] bg-[#f4fff4] text-[#2e8b57]'
                              : active
                                ? 'border-[#8fc4d8] bg-[#edf8fc] text-[#286b84]'
                                : 'border-[#dfe7ee] bg-white text-[#7b8790]'
                          }`}
                        >
                          <div>{item.done ? '✓' : active ? '…' : '○'}</div>
                          <div className="mt-1">{item.title.replace(' — ', ': ')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {applyMessage ? (
                <div className="mt-4 border border-[#cde7cf] bg-[#f4fff4] px-4 py-3 text-sm font-semibold text-[#2e8b57]">
                  {applyMessage}
                </div>
              ) : null}
              {applyError ? (
                <div className="mt-4 border border-[#efc0c0] bg-[#fff4f4] px-4 py-3 text-sm font-semibold text-[#b62d2d]">
                  {applyError}
                </div>
              ) : null}
            </div>

            <SSPDashboard language={language} fields={dashboardFields} />
          </>
        )}
      </SSPPortalShell>
    </>
  );
}
