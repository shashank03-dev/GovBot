import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import { buildPortalDocumentChecklist } from '@/lib/documentVault.mjs';
import { buildDashboardLoginHref, buildTrackHref, TRACK_SEARCH_HREF } from '@/lib/navigationLinks.mjs';
import {
  NSP_DEMO_DATA as DEMO_DATA,
  NSP_DEMO_SESSION_STORAGE_KEY,
  NSP_DEMO_STEPS as RAW_NSP_DEMO_STEPS,
  buildNspDemoDataFromFillValues,
  shouldShowNspShowcaseFallbackNotice,
} from '@/lib/nspDemoAutofill.mjs';

type FormFields = Partial<typeof DEMO_DATA>;
type DemoState = 'idle' | 'running' | 'uploading' | 'needs_documents' | 'done';
type VaultDocument = {
  id?: string;
  doc_type?: string;
  custom_label?: string | null;
  source?: string;
  status?: string;
  verification_status?: string;
  expiry_date?: string | null;
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
const DEMO_STEPS = RAW_NSP_DEMO_STEPS as Array<{
  field: keyof typeof DEMO_DATA;
  label: string;
  tab: number;
}>;
function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDocumentNames(items: DocumentChecklistItem[]) {
  return items.map((item) => item.label).join(', ');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TABS = ['Applicant Details', 'Academic Details', 'Bank Details', 'Documents & Submit'];

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(target: string, speed = 55): [string, boolean] {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    ref.current = setInterval(() => {
      i++;
      setDisplayed(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(ref.current!);
        setDone(true);
      }
    }, speed);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [target, speed]);

  return [displayed, done];
}

// ─── Form input styled to NSP ─────────────────────────────────────────────────
function NSPInput({
  label, value, active, filled, required = false,
}: {
  label: string; value: string; active: boolean; filled: boolean; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] font-semibold text-[#424242]">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div
        className="relative border text-[13px] px-3 py-2 bg-white transition-all duration-200"
        style={{
          borderColor: active ? '#C2185B' : filled ? '#4CAF50' : '#BDBDBD',
          boxShadow: active ? '0 0 0 3px rgba(194,24,91,0.2)' : 'none',
        }}
      >
        <span className={value ? 'text-[#212121]' : 'text-gray-300'}>
          {value || label}
        </span>
        {active && (
          <span className="inline-block w-0.5 h-4 bg-[#C2185B] ml-0.5 animate-pulse align-middle" />
        )}
        {filled && !active && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
        )}
      </div>
    </div>
  );
}

// ─── NSPSelect ────────────────────────────────────────────────────────────────
function NSPSelect({
  label, value, active, filled, required = false,
}: {
  label: string; value: string; active: boolean; filled: boolean; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] font-semibold text-[#424242]">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div
        className="relative border text-[13px] px-3 py-2 bg-white transition-all duration-200 flex items-center justify-between"
        style={{
          borderColor: active ? '#C2185B' : filled ? '#4CAF50' : '#BDBDBD',
          boxShadow: active ? '0 0 0 3px rgba(194,24,91,0.2)' : 'none',
        }}
      >
        <span className={value ? 'text-[#212121]' : 'text-gray-400'}>{value || `-- Select ${label} --`}</span>
        <span className="text-gray-400">▾</span>
        {active && (
          <div className="absolute left-0 right-0 -bottom-1 h-0.5 bg-[#C2185B] animate-pulse" />
        )}
        {filled && !active && (
          <span className="absolute right-6 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
        )}
      </div>
    </div>
  );
}

// ─── Doc validator slot state ─────────────────────────────────────────────────
type DocSlotStatus = 'idle' | 'loading' | 'valid' | 'invalid' | 'warning';
type DocSlot = {
  label: string;
  docType: 'income_cert' | 'caste_cert' | 'marksheet' | 'aadhaar';
  required: boolean;
  status: DocSlotStatus;
  message: string;
  expiryDate: string | null;
  flags: string[];
};

const INITIAL_DOC_SLOTS: DocSlot[] = [
  { label: 'Income Certificate', docType: 'income_cert', required: true, status: 'idle', message: '', expiryDate: null, flags: [] },
  { label: 'Caste / Category Certificate', docType: 'caste_cert', required: false, status: 'idle', message: '', expiryDate: null, flags: [] },
  { label: 'Previous Year Marksheet', docType: 'marksheet', required: true, status: 'idle', message: '', expiryDate: null, flags: [] },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NSPApply() {
  const router = useRouter();
  const sessionParam = (router.query.session as string) || '';
  const isSpectator = !!sessionParam;
  const portalId = typeof router.query.portal === 'string' ? router.query.portal : 'nsp';

  // ── spectator state ──
  const [spectatorData, setSpectatorData] = useState<{ step: number; total_steps: number; form_state: Record<string, string>; status: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── doc validator state ──
  const [docSlots, setDocSlots] = useState<DocSlot[]>(INITIAL_DOC_SLOTS);
  const docInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [activeTab, setActiveTab] = useState(0);
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [filledData, setFilledData] = useState<FormFields>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const [stepLog, setStepLog] = useState<{ label: string; done: boolean }[]>([]);
  const [progress, setProgress] = useState(0);
  const [confirmNumber, setConfirmNumber] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showShowcaseNotice, setShowShowcaseNotice] = useState(false);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [documentFetchState, setDocumentFetchState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable' | 'error'>('idle');
  const [documentFetchError, setDocumentFetchError] = useState('');
  const [documentGateMessage, setDocumentGateMessage] = useState('');
  const [currentTypeTarget, setCurrentTypeTarget] = useState('');
  const [typeSpeed] = useState(55);
  const activeDataRef = useRef<typeof DEMO_DATA>(DEMO_DATA);
  const hasApplicantPrefillRef = useRef(false);
  const trackHref = confirmNumber ? buildTrackHref(confirmNumber) : TRACK_SEARCH_HREF;
  const dashboardHref = buildDashboardLoginHref();
  const documentChecklist = useMemo(
    () => buildPortalDocumentChecklist(portalId, vaultDocuments) as PortalDocumentChecklist,
    [portalId, vaultDocuments],
  );
  const aadhaarChecklistItem = documentChecklist.items.find((item) => item.docType === 'aadhaar');
  const aadhaarSlotState: 'idle' | 'loading' | 'valid' | 'warning' =
    demoState === 'uploading'
      ? 'loading'
      : demoState === 'done' || (demoState === 'needs_documents' && aadhaarChecklistItem?.status === 'ready')
        ? 'valid'
        : demoState === 'needs_documents' && aadhaarChecklistItem?.status === 'needs_review'
          ? 'warning'
          : 'idle';

  // ── Load DigiLocker profile from review session or localStorage ──
  useEffect(() => {
    if (!router.isReady) return;

    const reviewSessionId = typeof router.query.review_session === 'string' ? router.query.review_session : '';
    const launchedFromFormFill = router.query.source === 'form-fill';
    const storedPhone = typeof window !== 'undefined' ? (localStorage.getItem('govbot_phone') || '') : '';

    const applyProfile = (profile: Partial<typeof DEMO_DATA>, suppliedValues: Record<string, unknown> = profile) => {
      const merged = { ...DEMO_DATA, ...profile };
      activeDataRef.current = merged;
      if (!shouldShowNspShowcaseFallbackNotice(suppliedValues)) {
        hasApplicantPrefillRef.current = true;
      }
    };

    const loadFromFormFill = () => {
      if (!launchedFromFormFill || typeof window === 'undefined') return false;
      const stored = window.sessionStorage.getItem(NSP_DEMO_SESSION_STORAGE_KEY);
      if (!stored) return false;

      try {
        const fillValues = JSON.parse(stored);
        applyProfile(buildNspDemoDataFromFillValues(fillValues), fillValues);
        return true;
      } catch {
        return false;
      } finally {
        window.sessionStorage.removeItem(NSP_DEMO_SESSION_STORAGE_KEY);
      }
    };

    const loadFromReview = async () => {
      if (!reviewSessionId || !storedPhone) return false;
      try {
        const res = await fetch(`/api/digilocker/review/${encodeURIComponent(reviewSessionId)}`);
        const data = await res.json();
        if (!res.ok || !data.portal_prefill) return false;
        applyProfile(data.portal_prefill);
        return true;
      } catch {
        return false;
      }
    };

    const loadFromLocalStorage = () => {
      const stored = localStorage.getItem('digilocker_profile');
      if (!stored) return;
      try {
        const profile = JSON.parse(stored);
        applyProfile(profile);
      } catch {}
    };

    void (async () => {
      if (loadFromFormFill()) return;
      const loadedReview = await loadFromReview();
      if (!loadedReview) loadFromLocalStorage();
    })();
  }, [router.isReady, router.query.review_session, router.query.source]);

  const stepIndexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autostartedRef = useRef(false);

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const loadVaultDocuments = useCallback(async () => {
    if (typeof window === 'undefined') return [] as VaultDocument[];

    const storedPhone = localStorage.getItem('govbot_phone') || '';
    const storedToken = localStorage.getItem('govbot_token') || '';

    if (!storedPhone || !storedToken) {
      setVaultDocuments([]);
      setDocumentFetchState('unavailable');
      setDocumentFetchError('');
      return [] as VaultDocument[];
    }

    setDocumentFetchState('loading');
    setDocumentFetchError('');

    try {
      const response = await fetch(
        buildProxyApiPath(`documents/${encodeURIComponent(storedPhone)}`),
        buildBackendRequestInit({
          headers: { Authorization: `Bearer ${storedToken}` },
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
      setDocumentFetchError(getErrorMessage(error, 'Could not fetch saved documents.'));
      return [] as VaultDocument[];
    }
  }, []);

  const updateDocumentSlotsFromChecklist = useCallback((checklist: PortalDocumentChecklist, phase: 'loading' | 'resolved') => {
    setDocSlots((currentSlots) => currentSlots.map((slot) => {
      const item = checklist.items.find((checklistItem) => checklistItem.docType === slot.docType);
      if (!item) return slot;

      if (phase === 'loading') {
        return {
          ...slot,
          status: 'loading',
          message: 'Fetching reviewed document from GovBot vault...',
          expiryDate: null,
          flags: [],
        };
      }

      if (item.status === 'ready') {
        return {
          ...slot,
          status: 'valid',
          message: 'Fetched reviewed document from GovBot vault.',
          expiryDate: item.document?.expiry_date || null,
          flags: [],
        };
      }

      if (item.status === 'needs_review') {
        return {
          ...slot,
          status: 'warning',
          message: 'Review this document in the vault before final submit.',
          expiryDate: item.document?.expiry_date || null,
          flags: ['needs_review'],
        };
      }

      return {
        ...slot,
        status: 'idle',
        message: '',
        expiryDate: null,
        flags: ['missing'],
      };
    }));
  }, []);

  const animateVaultDocumentUpload = useCallback(async (checklist: PortalDocumentChecklist) => {
    setActiveTab(3);
    updateDocumentSlotsFromChecklist(checklist, 'loading');
    setStepLog((prev) => [
      ...prev,
      { label: 'Opening GovBot vault document packet', done: true },
    ]);
    await wait(650);
    updateDocumentSlotsFromChecklist(checklist, 'resolved');
    setStepLog((prev) => [
      ...prev,
      ...checklist.items.map((item) => ({
        label: item.status === 'ready'
          ? `${item.label} uploaded from vault`
          : `${item.label} requires user action`,
        done: item.status === 'ready',
      })),
    ]);
  }, [updateDocumentSlotsFromChecklist]);

  useEffect(() => {
    if (!router.isReady) return;
    void loadVaultDocuments();
  }, [loadVaultDocuments, router.isReady]);

  // Typewriter for current field
  const [typedValue, typeDone] = useTypewriter(currentTypeTarget, typeSpeed);

  // When typing finishes for a field, schedule the next
  useEffect(() => {
    if (demoState !== 'running') return;
    if (!typeDone) return;
    if (!activeField) return;

    const stepIdx = stepIndexRef.current;
    const step = DEMO_STEPS[stepIdx];
    if (!step) return;

    // Commit the value and mark step done
    setFilledData((prev) => ({ ...prev, [step.field]: activeDataRef.current[step.field] }));
    setStepLog((prev) => prev.map((s, i) => i === stepIdx ? { ...s, done: true } : s));

    // Move to next step
    const nextIdx = stepIdx + 1;
    stepIndexRef.current = nextIdx;
    const newProgress = Math.round((nextIdx / (DEMO_STEPS.length + 1)) * 100);
    setProgress(newProgress);

    if (nextIdx < DEMO_STEPS.length) {
      timeoutRef.current = setTimeout(() => {
        const nextStep = DEMO_STEPS[nextIdx];
        setActiveTab(nextStep.tab);
        setActiveField(nextStep.field);
        setCurrentTypeTarget(activeDataRef.current[nextStep.field]);
      }, 400);
    } else {
      // Move to upload phase
      setActiveField(null);
      setDemoState('uploading');
      setActiveTab(3);
    }
  }, [typeDone, activeField, demoState]);

  // Handle uploading phase
  useEffect(() => {
    if (demoState !== 'uploading') return;
    const fakeUpload = setTimeout(() => {
      setProgress(95);
      const submitApplication = async () => {
        try {
          setDocumentGateMessage('');
          setActiveTab(3);
          setProgress(88);
          const latestDocuments = await loadVaultDocuments();
          const latestChecklist = buildPortalDocumentChecklist(portalId, latestDocuments) as PortalDocumentChecklist;
          await animateVaultDocumentUpload(latestChecklist);
          if (!latestChecklist.isComplete) {
            const missingNames = formatDocumentNames(latestChecklist.missingRequiredDocuments);
            const reviewNames = formatDocumentNames(latestChecklist.reviewRequiredDocuments);
            const problemParts = [
              missingNames ? `Missing: ${missingNames}` : '',
              reviewNames ? `Needs review: ${reviewNames}` : '',
            ].filter(Boolean);
            setProgress(96);
            setDemoState('needs_documents');
            setActiveTab(3);
            setDocumentGateMessage(
              `${problemParts.join('. ')}. Please add or correct these documents, then press Submit again.`,
            );
            setStepLog((prev) => [
              ...prev,
              { label: 'Required documents checked — user input needed before submit', done: true },
            ]);
            return;
          }

          if (!hasApplicantPrefillRef.current) {
            setShowShowcaseNotice(true);
            setStepLog((prev) => [
              ...prev,
              { label: 'No applicant fields found — showcase sample data disclosed', done: true },
            ]);
            await new Promise((resolve) => setTimeout(resolve, 1400));
          }

          const rawPhone = localStorage.getItem('govbot_phone') || activeDataRef.current.mobile;
          const digitsOnly = rawPhone.replace(/\D/g, '');
          const phone = digitsOnly.startsWith('91') ? digitsOnly : `91${digitsOnly.slice(-10)}`;
          const marksPct = Number.parseFloat(activeDataRef.current.marks);
          const income = Number.parseInt(activeDataRef.current.income, 10);

          const res = await fetch(`/api/portals/${portalId}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: activeDataRef.current.name,
              dob: activeDataRef.current.dob,
              income: Number.isFinite(income) ? income : 25000,
              media_id: 'web-demo',
              phone,
              caste: activeDataRef.current.category,
              marks_pct: Number.isFinite(marksPct) ? marksPct : 0,
              religion: activeDataRef.current.religion,
              institution: activeDataRef.current.institute,
              course: activeDataRef.current.course,
            }),
          });

          const data = await res.json();
          if (!res.ok || data.status !== 'success' || !data.confirmation_number) {
            throw new Error(data.error || 'Failed to submit application');
          }

          setConfirmNumber(data.confirmation_number);
          setProgress(100);
          setDemoState('done');
          setShowSuccess(true);
          setSubmitError('');
          setStepLog((prev) => [...prev, { label: 'Documents uploaded', done: true }, { label: 'Application submitted ✅', done: true }]);
        } catch (error: unknown) {
          setSubmitError(getErrorMessage(error, 'Failed to submit application'));
          setDemoState('idle');
        }
      };

      void submitApplication();
    }, 2500);
    return () => clearTimeout(fakeUpload);
  }, [animateVaultDocumentUpload, demoState, loadVaultDocuments, portalId]);

  const startDemo = useCallback(() => {
    clearTimeouts();
    setFilledData({});
    setActiveField(null);
    setStepLog(DEMO_STEPS.map((s) => ({ label: s.label, done: false })));
    setProgress(0);
    setShowSuccess(false);
    setSubmitError('');
    setShowShowcaseNotice(false);
    setDocumentGateMessage('');
    setConfirmNumber('');
    setActiveTab(0);
    stepIndexRef.current = 0;

    setDemoState('running');

    // Start first step
    setTimeout(() => {
      const firstStep = DEMO_STEPS[0];
      setActiveTab(firstStep.tab);
      setActiveField(firstStep.field);
      setCurrentTypeTarget(activeDataRef.current[firstStep.field]);
    }, 600);
  }, [clearTimeouts]);

  useEffect(() => {
    if (!router.isReady || isSpectator || demoState !== 'idle' || autostartedRef.current) return;
    if (router.query.autostart !== '1' || router.query.source !== 'form-fill') return;
    autostartedRef.current = true;
    startDemo();
  }, [demoState, isSpectator, router.isReady, router.query.autostart, router.query.source, startDemo]);

  // ── spectator polling ──
  useEffect(() => {
    if (!isSpectator) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/live/${sessionParam}`);
        if (!res.ok) return;
        const data = await res.json();
        setSpectatorData(data);
        // animate fields into form
        const fs = data.form_state as Record<string, string>;
        setFilledData((prev) => ({ ...prev, ...fs }));
        const pct = Math.round(((data.step - 1) / (data.total_steps || 5)) * 100);
        setProgress(pct);
        if (data.status === 'complete') {
          if (pollRef.current) clearInterval(pollRef.current);
          setShowSuccess(true);
          setConfirmNumber('');
        }
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isSpectator, sessionParam]);

  // ── doc validator upload handler ──
  const handleDocUpload = useCallback(async (idx: number, file: File) => {
    const slot = docSlots[idx];
    setDocSlots((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'loading', message: '' } : s));
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/documents/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_type: slot.docType, image_b64: b64 }),
        });
        const data = await res.json();
        const newStatus: DocSlotStatus = data.valid ? 'valid' : data.flags?.includes('low_quality') ? 'warning' : 'invalid';
        setDocSlots((prev) => prev.map((s, i) => i === idx ? {
          ...s,
          status: newStatus,
          message: data.message || '',
          expiryDate: data.expiry_date || null,
          flags: data.flags || [],
        } : s));
      };
      reader.readAsDataURL(file);
    } catch {
      setDocSlots((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'invalid', message: 'Upload failed' } : s));
    }
  }, [docSlots]);

  const hasInvalidDocs = docSlots.some((s) => s.required && s.status === 'invalid');

  const resetDemo = () => {
    clearTimeouts();
    setDemoState('idle');
    setFilledData({});
    setActiveField(null);
    setStepLog([]);
    setProgress(0);
    setShowSuccess(false);
    setSubmitError('');
    setShowShowcaseNotice(false);
    setDocumentGateMessage('');
    setConfirmNumber('');
    setCurrentTypeTarget('');
    setDocSlots(INITIAL_DOC_SLOTS);
    setActiveTab(0);
    stepIndexRef.current = 0;
  };

  // Helper: get display value (typewriter for active, final for filled)
  const val = (field: keyof typeof DEMO_DATA): string => {
    if (activeField === field) return typedValue;
    return filledData[field] || '';
  };
  const isActive = (field: string) => activeField === field;
  const isFilled = (field: keyof typeof DEMO_DATA) => !!filledData[field] && activeField !== field;

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-[#212121]">
      <Head>
        <title>Apply For Scholarship | NSP</title>
      </Head>

      {/* ── LIVE SPECTATOR BANNER ── */}
      {isSpectator && (
        <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping inline-block" />
            <span className="font-bold">Live</span>
            <span className="text-red-100">— Your WhatsApp agent is filling this form</span>
          </div>
          {spectatorData && (
            <span className="text-red-100 text-xs">Step {spectatorData.step} of {spectatorData.total_steps}</span>
          )}
        </div>
      )}

      {/* TOP UTILITY BAR */}
      <div className="bg-[#1A237E] text-white text-xs py-1 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span>Government of India</span>
          <span className="text-gray-300">|</span>
          <span>Ministry of Electronics &amp; Information Technology</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <Link href="/nsp" className="text-blue-200 hover:underline">← NSP Home</Link>
        </div>
      </div>

      {/* NAV */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F5F5F5] border border-gray-200 flex items-center justify-center text-xl">🏛️</div>
            <div className="flex items-center gap-2">
              <span className="text-[#C2185B] text-2xl font-black">NSP</span>
              <div>
                <div className="text-[10px] text-gray-600 leading-tight">national scholarship portal</div>
                <div className="text-[9px] text-gray-400 leading-tight">Academic Year 2025-26</div>
              </div>
            </div>
          </div>
          <div className="text-[13px] text-gray-500 font-semibold">
            Fresh Scholarship Application
          </div>
        </div>
      </header>

      {/* BREADCRUMB */}
      <div className="bg-[#EEEEEE] border-b border-gray-300 px-4 py-2 text-[12px] text-gray-500">
        <Link href="/nsp" className="hover:text-[#C2185B]">Home</Link>
        <span className="mx-1">›</span>
        <span>Students</span>
        <span className="mx-1">›</span>
        <span className="text-[#C2185B] font-semibold">Apply For Scholarship</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: FORM ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-[#E0E0E0] shadow-sm">
            {/* Form header */}
            <div className="bg-[#C2185B] text-white px-5 py-3">
              <h2 className="font-bold text-[15px]">Fresh Scholarship Application Form AY 2025-26</h2>
              <p className="text-[11px] text-pink-100 mt-0.5">All fields marked with <span className="text-yellow-300 font-bold">*</span> are mandatory</p>
            </div>

            {router.query.source === 'form-fill' && (
              <div className="px-5 pt-4 pb-3 border-b border-[#E0E0E0] bg-[#E3F2FD]">
                <div className="text-[13px] font-bold text-[#0D47A1]">Opened from GovBot form-fill proof flow</div>
                <div className="text-[11px] text-sky-700 mt-0.5">GovBot mapped the official NSP sample to this local workspace and started the fast-fill run.</div>
              </div>
            )}

            {/* TABS */}
            <div className="flex border-b border-[#E0E0E0] overflow-x-auto">
              {TABS.map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i)}
                  className="px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-all border-b-2"
                  style={{
                    borderBottomColor: activeTab === i ? '#C2185B' : 'transparent',
                    color: activeTab === i ? '#C2185B' : '#757575',
                    backgroundColor: activeTab === i ? '#FFF5F7' : 'transparent',
                  }}
                >
                  <span className="mr-1.5">
                    {i < (demoState === 'running' ? DEMO_STEPS.filter(s => s.tab < i).length > 0 ? i : 0 : 0) ? '✅' : `${i + 1}.`}
                  </span>
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* TAB 1: Applicant Details */}
              {activeTab === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <NSPInput label="Full Name (as per Aadhaar)" value={val('name')} active={isActive('name')} filled={isFilled('name')} required />
                  </div>
                  <NSPInput label="Date of Birth (DD/MM/YYYY)" value={val('dob')} active={isActive('dob')} filled={isFilled('dob')} required />
                  <NSPSelect label="Gender" value={val('gender')} active={isActive('gender')} filled={isFilled('gender')} required />
                  <NSPSelect label="Category" value={val('category')} active={isActive('category')} filled={isFilled('category')} required />
                  <NSPSelect label="Religion" value={val('religion')} active={isActive('religion')} filled={isFilled('religion')} />
                  <NSPInput label="Mobile Number" value={val('mobile')} active={isActive('mobile')} filled={isFilled('mobile')} required />
                  <NSPInput label="Email ID" value={val('email')} active={isActive('email')} filled={isFilled('email')} />
                  <NSPInput label="Aadhaar Number" value={val('aadhaar')} active={isActive('aadhaar')} filled={isFilled('aadhaar')} required />
                  <NSPInput label="Annual Family Income (₹)" value={val('income')} active={isActive('income')} filled={isFilled('income')} required />
                  <NSPSelect label="State of Domicile" value={val('domicile')} active={isActive('domicile')} filled={isFilled('domicile')} required />
                </div>
              )}

              {/* TAB 2: Academic Details */}
              {activeTab === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NSPSelect label="Institute State" value={val('instituteState')} active={isActive('instituteState')} filled={isFilled('instituteState')} required />
                  <NSPSelect label="Institute District" value={val('district')} active={isActive('district')} filled={isFilled('district')} required />
                  <div className="sm:col-span-2">
                    <NSPInput label="Institute Name" value={val('institute')} active={isActive('institute')} filled={isFilled('institute')} required />
                  </div>
                  <NSPSelect label="Course / Class" value={val('course')} active={isActive('course')} filled={isFilled('course')} required />
                  <NSPSelect label="Year of Study" value={val('year')} active={isActive('year')} filled={isFilled('year')} required />
                  <NSPInput label="Board / University" value={val('board')} active={isActive('board')} filled={isFilled('board')} />
                  <NSPInput label="Previous Year Marks (%)" value={val('marks')} active={isActive('marks')} filled={isFilled('marks')} required />
                  <NSPInput label="Admission Date (DD/MM/YYYY)" value={val('admissionDate')} active={isActive('admissionDate')} filled={isFilled('admissionDate')} />
                </div>
              )}

              {/* TAB 3: Bank Details */}
              {activeTab === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <NSPInput label="Account Holder Name" value={val('accountHolder')} active={isActive('accountHolder')} filled={isFilled('accountHolder')} required />
                  </div>
                  <NSPSelect label="Bank Name" value={val('bankName')} active={isActive('bankName')} filled={isFilled('bankName')} required />
                  <NSPInput label="Account Number" value={val('accountNo')} active={isActive('accountNo')} filled={isFilled('accountNo')} required />
                  <NSPInput label="Confirm Account Number" value={val('confirmAccountNo')} active={isActive('confirmAccountNo')} filled={isFilled('confirmAccountNo')} required />
                  <NSPInput label="IFSC Code" value={val('ifsc')} active={isActive('ifsc')} filled={isFilled('ifsc')} required />
                  <NSPInput label="Branch Name" value={val('branch')} active={isActive('branch')} filled={isFilled('branch')} />
                </div>
              )}

              {/* TAB 4: Documents & Submit */}
              {activeTab === 3 && (
                <div className="space-y-4">
                  {/* Aadhaar slot — demo-driven */}
                  <div
                    className="border-2 border-dashed p-4 flex items-center justify-between transition-all"
                    style={{
                      borderColor: aadhaarSlotState === 'valid' ? '#4CAF50' : aadhaarSlotState === 'warning' ? '#FB8C00' : aadhaarSlotState === 'loading' ? '#4CAF50' : '#BDBDBD',
                      backgroundColor: aadhaarSlotState === 'valid' || aadhaarSlotState === 'loading' ? '#F1F8E9' : aadhaarSlotState === 'warning' ? '#FFF3E0' : '#FAFAFA',
                    }}
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-[#424242]">Aadhaar Card<span className="text-red-500 ml-0.5">*</span></div>
                      <div className="text-[11px] text-gray-400 mt-0.5">JPG/PNG/PDF, max 2MB</div>
                    </div>
                    {aadhaarSlotState === 'loading' ? (
                      <div className="flex items-center gap-2 text-[#C2185B] text-sm"><span className="animate-spin">⟳</span> Uploading...</div>
                    ) : aadhaarSlotState === 'valid' ? (
                      <span className="text-green-600 font-bold text-sm">✅ Uploaded</span>
                    ) : aadhaarSlotState === 'warning' ? (
                      <span className="text-amber-600 font-bold text-sm">⚠ Review</span>
                    ) : (
                      <button className="border border-[#C2185B] text-[#C2185B] text-[12px] px-3 py-1.5 hover:bg-[#C2185B] hover:text-white transition-colors">Choose File</button>
                    )}
                  </div>

                  {/* Validated document slots */}
                  {docSlots.map((slot, idx) => (
                    <div
                      key={slot.docType}
                      className="border-2 border-dashed p-4 transition-all"
                      style={{
                        borderColor: slot.status === 'valid' ? '#4CAF50' : slot.status === 'invalid' ? '#E53935' : slot.status === 'warning' ? '#FB8C00' : '#BDBDBD',
                        backgroundColor: slot.status === 'valid' ? '#F1F8E9' : slot.status === 'invalid' ? '#FFEBEE' : slot.status === 'warning' ? '#FFF3E0' : '#FAFAFA',
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleDocUpload(idx, f); }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[13px] font-semibold text-[#424242]">
                            {slot.label}{slot.required && <span className="text-red-500 ml-0.5">*</span>}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">Drag & drop or click — JPG/PNG/PDF, max 2MB</div>
                        </div>
                        {slot.status === 'loading' ? (
                          <div className="flex items-center gap-1 text-[#C2185B] text-sm"><span className="animate-spin">⟳</span> Checking...</div>
                        ) : slot.status === 'valid' ? (
                          <span className="text-green-600 font-bold text-sm">✅ Valid{slot.expiryDate ? ` until ${slot.expiryDate}` : ''}</span>
                        ) : slot.status === 'invalid' ? (
                          <span className="text-red-600 font-bold text-sm">✗ Invalid</span>
                        ) : slot.status === 'warning' ? (
                          <span className="text-amber-600 font-bold text-sm">⚠ Warning</span>
                        ) : (
                          <label className="cursor-pointer border border-[#C2185B] text-[#C2185B] text-[12px] px-3 py-1.5 hover:bg-[#C2185B] hover:text-white transition-colors">
                            Choose File
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              ref={(el) => { docInputRefs.current[idx] = el; }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(idx, f); }}
                            />
                          </label>
                        )}
                      </div>
                      {slot.message && slot.status !== 'idle' && (
                        <div className={`mt-2 text-[11px] ${
                          slot.status === 'valid' ? 'text-green-700' :
                          slot.status === 'warning' ? 'text-amber-700' : 'text-red-700'
                        }`}>{slot.message}</div>
                      )}
                      {(slot.status === 'valid' || slot.status === 'warning') && (
                        <button
                          className="mt-2 text-[11px] text-gray-500 underline"
                          onClick={() => setDocSlots((prev) => prev.map((s, i) => i === idx ? { ...INITIAL_DOC_SLOTS[i], status: 'idle' } : s))}
                        >✏️ Re-upload</button>
                      )}
                    </div>
                  ))}

                  {hasInvalidDocs && (
                    <div className="bg-red-50 border border-red-300 p-3 text-[12px] text-red-700 font-semibold">
                      ⚠ One or more required documents are invalid. Please re-upload before submitting.
                    </div>
                  )}

                  {/* Declaration */}
                  <div className="mt-4 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={demoState === 'done'}
                      readOnly
                      className="mt-0.5 accent-[#C2185B]"
                    />
                    <label className="text-[12px] text-gray-600 leading-relaxed">
                      I hereby declare that the information furnished above is true, complete, and correct to the best of my knowledge and belief. I understand that in the event of any information being found false or incorrect at any stage, my application is liable to be summarily rejected.
                    </label>
                  </div>

                  {demoState !== 'done' && (
                    <button
                      type="button"
                      disabled={hasInvalidDocs || demoState !== 'needs_documents'}
                      onClick={() => {
                        setSubmitError('');
                        setDocumentGateMessage('');
                        setDemoState('uploading');
                      }}
                      className={`w-full mt-2 py-3 font-bold text-sm ${
                        hasInvalidDocs || demoState !== 'needs_documents'
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-[#C2185B] text-white'
                      }`}
                    >
                      {demoState === 'needs_documents' ? 'SUBMIT AFTER ADDING DOCUMENTS' : 'SUBMIT APPLICATION'}
                    </button>
                  )}
                </div>
              )}

              {/* Tab navigation buttons */}
              <div className="flex justify-between mt-6 pt-4 border-t border-[#E0E0E0]">
                <button
                  onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
                  disabled={activeTab === 0}
                  className="px-4 py-2 border border-gray-300 text-gray-600 text-sm hover:border-[#C2185B] hover:text-[#C2185B] disabled:opacity-40 transition-colors"
                >
                  ‹ Previous
                </button>
                {activeTab < TABS.length - 1 && (
                  <button
                    onClick={() => setActiveTab((t) => Math.min(TABS.length - 1, t + 1))}
                    className="px-4 py-2 bg-[#C2185B] text-white text-sm hover:bg-[#AD1457] transition-colors"
                  >
                    Next ›
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: GOVBOT PANEL ── */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white border border-[#E0E0E0] shadow-sm sticky top-20">
            {/* Panel header */}
            <div className="bg-[#212121] text-white px-4 py-3 flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <div className="font-bold text-sm">GovBot Live Demo</div>
                <div className="text-[11px] text-gray-400">AI-powered form automation</div>
              </div>
            </div>

            <div className="p-4">
              {/* Status */}
              <div className="text-[12px] text-gray-500 mb-3 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${demoState === 'running' || demoState === 'uploading' ? 'bg-green-500 animate-pulse' : demoState === 'done' ? 'bg-green-500' : demoState === 'needs_documents' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                {demoState === 'idle'
                  ? 'Ready'
                  : demoState === 'running'
                    ? 'Filling form...'
                    : demoState === 'uploading'
                      ? 'Fetching documents...'
                      : demoState === 'needs_documents'
                        ? 'Documents needed'
                        : '✅ Application submitted'}
              </div>

              <div className="mb-4 border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-3 text-[12px]">
                <div className="font-semibold text-[#424242]">Document packet</div>
                <div className="mt-1 text-gray-500">
                  {documentFetchState === 'loading'
                    ? 'Fetching saved documents from GovBot vault...'
                    : documentFetchState === 'unavailable'
                      ? 'Login required to fetch actual saved documents.'
                      : documentFetchState === 'error'
                        ? documentFetchError || 'Could not fetch saved documents.'
                        : `${documentChecklist.readyRequiredDocuments.length}/${documentChecklist.items.length} required documents ready`}
                </div>
                {documentChecklist.items.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {documentChecklist.items.map((item) => (
                      <div key={item.docType} className="flex items-center justify-between gap-2">
                        <span className="text-gray-600">{item.label}</span>
                        <span className={`font-semibold ${
                          item.status === 'ready'
                            ? 'text-green-600'
                            : item.status === 'needs_review'
                              ? 'text-amber-700'
                              : 'text-red-600'
                        }`}>
                          {item.status === 'ready' ? 'Fetched' : item.status === 'needs_review' ? 'Review' : 'Missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {demoState !== 'idle' && (
                <div className="mb-4">
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C2185B] transition-all duration-500 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* CTA Button */}
              {demoState === 'idle' && (
                <button
                  onClick={startDemo}
                  className="w-full bg-[#C2185B] text-white font-bold py-2.5 text-sm hover:bg-[#AD1457] transition-colors mb-4"
                >
                  ▶ Watch GovBot Apply
                </button>
              )}
              {demoState === 'done' && (
                <button
                  onClick={resetDemo}
                  className="w-full border border-[#C2185B] text-[#C2185B] font-bold py-2.5 text-sm hover:bg-[#C2185B] hover:text-white transition-colors mb-4"
                >
                  ↺ Run Again
                </button>
              )}

              {submitError && (
                <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {submitError}
                </div>
              )}

              {showShowcaseNotice && (
                <div className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  <span className="font-bold">Showcase notice:</span> No applicant fields were added before this run, so GovBot is using clearly marked sample data for the demo submission.
                </div>
              )}

              {documentGateMessage && (
                <div className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  <span className="font-bold">Action needed:</span> {documentGateMessage}
                  <div className="mt-3 flex flex-col gap-2">
                    <Link href="/documents" className="border border-amber-500 px-3 py-2 text-center font-bold uppercase tracking-[0.08em] text-amber-800">
                      Upload missing documents
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitError('');
                        setDocumentGateMessage('');
                        setDemoState('uploading');
                      }}
                      className="bg-[#C2185B] px-3 py-2 font-bold uppercase tracking-[0.08em] text-white"
                    >
                      I added documents — submit again
                    </button>
                  </div>
                </div>
              )}

              {/* Step Log */}
              {stepLog.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Activity Log</div>
                  {stepLog.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      {step.done ? (
                        <span className="text-green-500 flex-shrink-0">✅</span>
                      ) : i === stepLog.findIndex((s) => !s.done) ? (
                        <span className="text-[#C2185B] flex-shrink-0 animate-pulse">⏳</span>
                      ) : (
                        <span className="text-gray-300 flex-shrink-0">○</span>
                      )}
                      <span className={step.done ? 'text-[#212121]' : i === stepLog.findIndex((s) => !s.done) ? 'text-[#C2185B] font-semibold' : 'text-gray-400'}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ── SUCCESS OVERLAY ── */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full border-t-4 border-[#4CAF50] shadow-2xl p-8 text-center animate-fade-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-[#212121] mb-2">Application Submitted!</h2>
            <p className="text-sm text-gray-500 mb-4">Your scholarship application has been successfully submitted to the National Scholarship Portal.</p>
            <div className="bg-[#F1F8E9] border border-[#A5D6A7] p-4 mb-6 rounded-none">
              <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Confirmation Number</div>
              <div className="text-2xl font-black text-[#2E7D32] font-mono tracking-widest">{confirmNumber}</div>
            </div>
            <div className="space-y-3 text-[13px] text-gray-600 mb-6">
              <p>📱 Confirmation sent to your WhatsApp</p>
              <p>⏳ Your application has been added. It may take some time before it moves to the next stage.</p>
              <p>
                📋 Track status at:{' '}
                <Link href={trackHref} className="text-[#C2185B] font-semibold hover:underline">
                  {trackHref}
                </Link>
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/bank-verify"
                className="flex-1 border border-[#C2185B] text-[#C2185B] py-2.5 text-sm font-bold hover:bg-[#C2185B] hover:text-white transition-colors flex items-center justify-center"
              >
                Verify Bank
              </Link>
              <Link
                href={dashboardHref}
                className="flex-1 bg-[#C2185B] text-white py-2.5 text-sm font-bold hover:bg-[#AD1457] transition-colors flex items-center justify-center"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
