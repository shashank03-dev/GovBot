import { useEffect, useEffectEvent, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, MapPin, IndianRupee, GraduationCap, CreditCard,
  ScanLine, Link2, CheckCircle, AlertCircle, ChevronRight, Save, ArrowLeft
} from 'lucide-react';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import { normalizeIndianPhone } from '@/lib/phoneStorage.mjs';
import {
  hasProfileContent,
  mergeReviewIntoProfile,
} from '@/lib/profileSync.mjs';

type Profile = {
  full_name?: string;
  dob?: string;
  gender?: string;
  aadhaar_number?: string;
  aadhaar_last4?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  income?: number | string;
  caste?: string;
  religion?: string;
  course_level?: string;
  course_name?: string;
  institution?: string;
  board?: string;
  academic_year?: string;
  admission_date?: string;
  marks_pct?: number | string;
  bank_account?: string;
  bank_ifsc?: string;
  bank_name?: string;
  bank_branch?: string;
  father_name?: string;
  mother_name?: string;
  email?: string;
  digilocker_connected?: boolean;
};

type Section = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  fields: FieldDef[];
};

type FieldDef = {
  key: keyof Profile;
  label: string;
  type?: string;
  placeholder?: string;
  options?: string[];
};

type ProfileApiResponse = {
  profile?: Profile;
  completeness_pct?: number;
  missing_fields?: string[];
  vault_synced_documents?: string[];
  detail?: string;
};

const SECTIONS: Section[] = [
  {
    id: 'personal',
    label: 'Personal Info',
    icon: User,
    color: '#ff9933',
    fields: [
      { key: 'full_name', label: 'Full Name', placeholder: 'As per Aadhaar' },
      { key: 'dob', label: 'Date of Birth', type: 'date' },
      { key: 'gender', label: 'Gender', options: ['Male', 'Female', 'Other'] },
      { key: 'father_name', label: "Father's Name", placeholder: 'As per Aadhaar' },
      { key: 'mother_name', label: "Mother's Name", placeholder: 'As per Aadhaar' },
      { key: 'email', label: 'Email Address', type: 'email', placeholder: 'example@email.com' },
      { key: 'aadhaar_number', label: 'Aadhaar Number', placeholder: '12-digit Aadhaar number' },
    ],
  },
  {
    id: 'address',
    label: 'Address',
    icon: MapPin,
    color: '#3b82f6',
    fields: [
      { key: 'address', label: 'Full Address', placeholder: 'Street, Area' },
      { key: 'district', label: 'District', placeholder: 'e.g. Bangalore Urban' },
      { key: 'state', label: 'State', placeholder: 'e.g. Karnataka' },
      { key: 'pincode', label: 'PIN Code', placeholder: '6-digit PIN' },
    ],
  },
  {
    id: 'financial',
    label: 'Financial & Category',
    icon: IndianRupee,
    color: '#10b981',
    fields: [
      { key: 'income', label: 'Annual Family Income (₹)', type: 'number', placeholder: 'e.g. 250000' },
      { key: 'caste', label: 'Caste Category', options: ['general', 'obc', 'sc', 'st', 'ews'] },
      { key: 'religion', label: 'Religion', options: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other'] },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    icon: GraduationCap,
    color: '#8b5cf6',
    fields: [
      { key: 'course_level', label: 'Course Level', options: ['pre_matric', 'post_matric', 'degree', 'pg'] },
      { key: 'course_name', label: 'Course Name', placeholder: 'e.g. Information Science' },
      { key: 'institution', label: 'Institution / College', placeholder: 'Full institution name' },
      { key: 'board', label: 'Board / University', placeholder: 'Board or university name' },
      { key: 'academic_year', label: 'Academic Year', placeholder: 'e.g. 2025' },
      { key: 'admission_date', label: 'Date of Admission', type: 'date' },
      { key: 'marks_pct', label: 'Marks % (Last Exam)', type: 'number', placeholder: 'e.g. 85.5' },
    ],
  },
  {
    id: 'bank',
    label: 'Bank Details',
    icon: CreditCard,
    color: '#ef4444',
    fields: [
      { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. State Bank of India' },
      { key: 'bank_ifsc', label: 'IFSC Code', placeholder: '11-character IFSC' },
      { key: 'bank_account', label: 'Account Number', placeholder: '9-18 digit account number' },
      { key: 'bank_branch', label: 'Branch Name', placeholder: 'e.g. HMT Layout' },
    ],
  },
];

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct < 30 ? '#ef4444' : pct < 60 ? '#f59e0b' : pct < 90 ? '#3b82f6' : '#10b981';
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-slate-700">Profile Completeness</span>
        <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      {pct === 100 ? (
        <p className="text-xs text-emerald-600 mt-1 font-medium">✅ Profile complete — all forms will be auto-filled!</p>
      ) : (
        <p className="text-xs text-slate-400 mt-1">{100 - pct}% remaining — complete to enable 1-tap form fill on any government portal</p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({});
  const [formData, setFormData] = useState<Profile>({});
  const [completeness, setCompleteness] = useState(0);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('personal');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [sspLoading, setSspLoading] = useState(false);
  const [vaultAlert, setVaultAlert] = useState<string[]>([]);
  const [profileNotice, setProfileNotice] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getStoredPhone = () => {
    if (typeof window === 'undefined') return '';
    const storedPhone = localStorage.getItem('govbot_phone') || '';
    const canonicalPhone = normalizeIndianPhone(storedPhone) || storedPhone;
    if (canonicalPhone && canonicalPhone !== storedPhone) {
      localStorage.setItem('govbot_phone', canonicalPhone);
    }
    return canonicalPhone;
  };

  const applyProfileData = (data: ProfileApiResponse) => {
    const p = data.profile || {};
    setProfile(p);
    setFormData(p);
    setCompleteness(data.completeness_pct || 0);
    setMissingFields(data.missing_fields || []);
  };

  const fetchProfile = useEffectEvent(async (p: string) => {
    setLoading(true);
    setProfileNotice(null);
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(p)}`), buildBackendRequestInit({
        headers: { Authorization: `Bearer ${token}` },
      }));
      const data: ProfileApiResponse = await res.json().catch(() => ({}));

      if (res.ok) {
        applyProfileData(data);
        const reviewSessionId = typeof router.query.review_session === 'string' ? router.query.review_session : '';
        if (reviewSessionId && !hasProfileContent(data.profile || {})) {
          const reviewRes = await fetch(`/api/digilocker/review/${encodeURIComponent(reviewSessionId)}`);
          if (reviewRes.ok) {
            const reviewData = await reviewRes.json();
            const merged = mergeReviewIntoProfile(data.profile || {}, reviewData.imported_fields || {});
            setProfile(merged.profile);
            setFormData(merged.profile);
            setCompleteness(merged.completeness_pct);
            setMissingFields(merged.missing_fields);
            setProfileNotice({
              msg: 'Loaded your DigiLocker review into the profile form. Save any edits to keep them on your account.',
              type: 'success',
            });
          }
        }
      } else {
        const reviewSessionId = typeof router.query.review_session === 'string' ? router.query.review_session : '';
        let reviewLoaded = false;

        if (reviewSessionId) {
          const reviewRes = await fetch(`/api/digilocker/review/${encodeURIComponent(reviewSessionId)}`);
          if (reviewRes.ok) {
            const reviewData = await reviewRes.json();
            const merged = mergeReviewIntoProfile({}, reviewData.imported_fields || {});
            setProfile(merged.profile);
            setFormData(merged.profile);
            setCompleteness(merged.completeness_pct);
            setMissingFields(merged.missing_fields);
            setProfileNotice({
              msg: 'Loaded your DigiLocker review into the profile form. Save any edits to keep them on your account.',
              type: 'success',
            });
            reviewLoaded = true;
          }
        }

        if (!reviewLoaded) {
          setProfileNotice({
            msg: data.detail || 'Could not load your saved profile right now.',
            type: 'error',
          });
        }
      }
    } catch {
      setProfileNotice({
        msg: 'Could not load your saved profile right now.',
        type: 'error',
      });
    }
    setLoading(false);
  });

  useEffect(() => {
    const token = localStorage.getItem('govbot_token');
    if (!token) { router.push('/login'); return; }
    const p = getStoredPhone();
    if (p) fetchProfile(p);
  }, [router]);

  const updateField = (key: keyof Profile, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const getDirtyFields = (sectionId: string): Record<string, string | number> => {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return {};
    const dirty: Record<string, string | number> = {};
    const numericFields = ['income', 'marks_pct'];
    for (const field of section.fields) {
      const formVal = String(formData[field.key] ?? '').trim();
      const savedVal = String(profile[field.key] ?? '').trim();
      if (formVal && formVal !== savedVal) {
        dirty[field.key] = numericFields.includes(field.key) ? parseFloat(formVal) : formVal;
      }
    }
    return dirty;
  };

  const getAllDirtyFields = (): Record<string, string | number | boolean> => {
    const dirty: Record<string, string | number | boolean> = {};
    const numericFields = new Set(['income', 'marks_pct']);

    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const rawValue = formData[field.key];
        const formVal = String(rawValue ?? '').trim();
        const savedVal = String(profile[field.key] ?? '').trim();
        if (!formVal || formVal === savedVal) {
          continue;
        }
        dirty[field.key] = numericFields.has(field.key) ? parseFloat(formVal) : formVal;
      }
    }

    return dirty;
  };

  const hasDirtyFields = Object.keys(getDirtyFields(activeSection)).length > 0;

  const syncProfileToSSP = async () => {
    const phone = getStoredPhone();
    if (!phone) return;

    setSspLoading(true);
    try {
      const token = localStorage.getItem('govbot_token');
      const pendingProfileUpdates = getAllDirtyFields();

      if (Object.keys(pendingProfileUpdates).length > 0) {
        const saveResponse = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(phone)}`), buildBackendRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(pendingProfileUpdates),
        }));

        const savedProfile: ProfileApiResponse = await saveResponse.json().catch(() => ({}));
        if (!saveResponse.ok) {
          showToast(savedProfile.detail || 'Save your profile before syncing to SSP', 'error');
          setSspLoading(false);
          return;
        }
        applyProfileData(savedProfile);
      }

      const syncResponse = await fetch(buildProxyApiPath(`ssp/draft/${encodeURIComponent(phone)}/sync-profile`), buildBackendRequestInit({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }));
      const syncPayload = await syncResponse.json().catch(() => ({}));

      if (!syncResponse.ok) {
        showToast(syncPayload.detail || 'Could not add your profile to SSP', 'error');
        setSspLoading(false);
        return;
      }

      const updatedCount = Number(syncPayload.updated_count || 0);
      showToast(updatedCount > 0 ? `Added ${updatedCount} profile fields to SSP` : 'Your SSP draft is already up to date');
      await router.push('/ssp/dashboard');
    } catch {
      showToast('Could not add your profile to SSP', 'error');
    }
    setSspLoading(false);
  };

  const saveSection = async () => {
    const phone = getStoredPhone();
    if (!phone) return;
    const dirty = getDirtyFields(activeSection);
    if (Object.keys(dirty).length === 0) return;
    setSavingSection(true);
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(phone)}`), buildBackendRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(dirty),
      }));
      const data: ProfileApiResponse = await res.json().catch(() => ({}));
      if (res.ok) {
        applyProfileData(data);
        setSavedSection(activeSection);
        const syncedCount = Array.isArray(data.vault_synced_documents) ? data.vault_synced_documents.length : 0;
        showToast(
          syncedCount > 0
            ? `Changes saved and ${syncedCount} vault document${syncedCount === 1 ? '' : 's'} updated.`
            : 'Changes saved!',
        );
        setTimeout(() => setSavedSection(null), 2000);
      } else {
        showToast(data.detail || 'Failed to save', 'error');
      }
    } catch { showToast('Failed to save', 'error'); }
    setSavingSection(false);
  };

  const fillFromOcr = async () => {
    const phone = getStoredPhone();
    if (!phone) return;
    setOcrLoading(true);
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(phone)}/from-ocr`), buildBackendRequestInit({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }));
      if (res.ok) {
        applyProfileData(await res.json());
        showToast('✅ Profile auto-filled from Aadhaar OCR!');
      } else {
        showToast('No OCR data found — upload Aadhaar first', 'error');
      }
    } catch { showToast('OCR fill failed', 'error'); }
    setOcrLoading(false);
  };

  const fillFromVault = async () => {
    const phone = getStoredPhone();
    if (!phone) return;
    setVaultLoading(true);
    try {
      const token = localStorage.getItem('govbot_token');
      const res = await fetch(buildProxyApiPath(`profile/${encodeURIComponent(phone)}/from-vault`), buildBackendRequestInit({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }));
      const data: ProfileApiResponse = await res.json().catch(() => ({}));
      if (res.ok) {
        applyProfileData(data);
        const remaining = Array.isArray(data.missing_fields) ? data.missing_fields : [];
        setVaultAlert(remaining);
        showToast(remaining.length > 0 ? 'Vault data added. Some fields still need you.' : 'Profile filled from vault!');
      } else {
        showToast(data.detail || 'Vault fill failed', 'error');
      }
    } catch {
      showToast('Vault fill failed', 'error');
    }
    setVaultLoading(false);
  };

  const currentSection = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Profile | GovBot</title>
        <meta name="description" content="Build your citizen profile once — GovBot auto-fills every government form for you." />
      </Head>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                My Citizen Profile
              </h1>
              <p className="text-xs text-slate-400">Filled once → auto-fills every government form</p>
            </div>
            <Link
              href="/form-fill"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors"
            >
              Auto-Fill Form <ChevronRight size={14} />
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Completeness + Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <CompletenessBar pct={completeness} />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={fillFromVault}
                disabled={vaultLoading}
                className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-xl text-xs font-semibold hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                <Link2 size={14} />
                {vaultLoading ? 'Filling from Vault...' : 'Auto-fill from Vault'}
              </button>
              <button
                onClick={fillFromOcr}
                disabled={ocrLoading}
                className="flex items-center gap-2 px-3 py-2 bg-cyan-50 text-cyan-700 rounded-xl text-xs font-semibold hover:bg-cyan-100 transition-colors disabled:opacity-50"
              >
                <ScanLine size={14} />
                {ocrLoading ? 'Filling from OCR...' : 'Auto-fill from Aadhaar OCR'}
              </button>
              <Link
                href="/digilocker?portal=profile"
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                <Link2 size={14} />
                {profile.digilocker_connected ? '✅ DigiLocker Connected' : 'Connect DigiLocker'}
              </Link>
              <Link
                href="/ocr"
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors"
              >
                <ScanLine size={14} /> Upload Aadhaar
              </Link>
              <button
                onClick={syncProfileToSSP}
                disabled={sspLoading}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <GraduationCap size={14} />
                {sspLoading ? 'Adding To SSP...' : 'Apply Profile To SSP'}
              </button>
            </div>
            {vaultAlert.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">
                  Vault fill finished, but {vaultAlert.length} field{vaultAlert.length === 1 ? '' : 's'} still need your input.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vaultAlert.slice(0, 8).map(field => (
                    <span key={field} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                      {field.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {vaultAlert.length > 8 && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-lg text-xs">
                      +{vaultAlert.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {profileNotice && (
              <div className={`mt-4 rounded-2xl px-4 py-3 border ${profileNotice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <p className="text-sm font-medium">{profileNotice.msg}</p>
              </div>
            )}
          </div>

          {/* Section Tabs + Form */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex overflow-x-auto border-b border-slate-100 scrollbar-hide">
              {SECTIONS.map(sec => {
                const Icon = sec.icon;
                const isActive = sec.id === activeSection;
                const sectionMissing = sec.fields.filter(f => missingFields.includes(f.key)).length;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${isActive ? 'border-orange-400 text-orange-600 bg-orange-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    <Icon size={14} style={{ color: isActive ? sec.color : undefined }} />
                    {sec.label}
                    {sectionMissing > 0 && (
                      <span className="ml-1 w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] flex items-center justify-center font-bold">
                        {sectionMissing}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Fields */}
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentSection.fields.map(field => {
                  const isMissing = missingFields.includes(field.key);
                  const value = formData[field.key] ?? '';
                  const isDirty = String(value).trim() !== String(profile[field.key] ?? '').trim();

                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        {field.label}
                        {isMissing && !isDirty && <AlertCircle size={11} className="text-amber-400" />}
                        {!isMissing && !isDirty && value && <CheckCircle size={11} className="text-emerald-400" />}
                        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                      </label>
                      {field.options ? (
                        <select
                          value={String(value)}
                          onChange={e => updateField(field.key, e.target.value)}
                          className={`w-full px-3 py-2 text-sm border rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition ${isDirty ? 'border-orange-300 bg-orange-50/30' : 'border-slate-200'}`}
                        >
                          <option value="">Select…</option>
                          {field.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type || 'text'}
                          value={String(value)}
                          placeholder={field.placeholder}
                          onChange={e => updateField(field.key, e.target.value)}
                          className={`w-full px-3 py-2 text-sm border rounded-xl bg-white text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition ${isDirty ? 'border-orange-300 bg-orange-50/30' : 'border-slate-200'}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save button */}
              <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
                {savedSection === activeSection && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle size={14} /> Saved
                  </span>
                )}
                <button
                  onClick={saveSection}
                  disabled={!hasDirtyFields || savingSection}
                  className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingSection ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Missing fields summary */}
          {missingFields.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-700 mb-2">
                ⚠️ {missingFields.length} fields still missing — fill them to enable full auto-fill coverage
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.slice(0, 8).map(f => (
                  <span key={f} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
                {missingFields.length > 8 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-lg text-xs">
                    +{missingFields.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-5 text-white">
            <h3 className="font-bold text-base mb-1">Ready to auto-fill any form?</h3>
            <p className="text-sm text-orange-100 mb-3">Push this profile directly into your SSP draft or paste any government portal URL for generic auto-fill.</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={syncProfileToSSP}
                disabled={sspLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-emerald-700 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors disabled:opacity-60"
              >
                {sspLoading ? 'Adding To SSP...' : 'Add My Profile To SSP'} <ChevronRight size={14} />
              </button>
              <Link
                href="/form-fill"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-orange-600 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors"
              >
                Try Auto-Fill <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
