import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Lock, X } from 'lucide-react';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
import {
  DOCUMENT_TYPE_OPTIONS,
  describeVaultAction,
  getDocumentLabel,
  getDocumentTypeMeta,
  getDocumentUploadPrompt,
  getFocusedDocumentId,
  isCustomDocumentType,
  orderDocumentsWithFocusFirst,
} from '@/lib/documentVault.mjs';
const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'] as const;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type DocType = 'pan' | 'aadhaar' | 'income_cert' | 'caste_cert' | 'marksheet' | 'custom';

type VaultDocument = {
  id: string;
  phone: string;
  doc_type: DocType;
  custom_label?: string | null;
  source: string;
  status: string;
  verification_status: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  confidence?: number;
  created_at?: string;
  extracted_data?: Record<string, string | number | null>;
};

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
  error?: string;
};

type VaultActionKind = 'preview' | 'download' | 'edit' | 'delete';

type PasskeyFormState = {
  newPasskey: string;
  confirmPasskey: string;
  currentPasskey: string;
  error: string;
};

type VaultActionState = {
  action: VaultActionKind;
  documentId: string;
  documentLabel: string;
  docType: DocType;
  passkey: string;
  error: string;
};

function prettyLabel(docType: string, customLabel?: string | null) {
  return getDocumentLabel(docType, customLabel || '');
}

function prettyFieldName(key: string) {
  return key
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function editableFieldsFor(docType: DocType) {
  const defaults: Record<DocType, string[]> = {
    pan: ['pan_number', 'full_name', 'father_name', 'dob'],
    aadhaar: ['aadhaar_number', 'full_name', 'dob', 'gender', 'address'],
    income_cert: ['certificate_number', 'annual_income', 'issue_date', 'valid_until'],
    caste_cert: ['certificate_number', 'caste', 'category', 'issue_date'],
    marksheet: ['student_name', 'roll_number', 'year', 'percentage', 'issue_date'],
    custom: ['summary', 'document_type_hint', 'reference_number', 'issue_date', 'valid_until', 'key_points'],
  };
  return defaults[docType];
}

function normalizeCustomLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function validateCustomLabel(value: string) {
  const normalized = normalizeCustomLabel(value);
  if (!normalized) {
    return 'Enter a document name before uploading a custom document.';
  }
  if (normalized.length > 80) {
    return 'Document name must be 80 characters or fewer.';
  }
  return '';
}

function validateClientFile(file: File) {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type as typeof ALLOWED_UPLOAD_TYPES[number])) {
    return 'Only JPG, PNG, or PDF files are allowed.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'File is too large. Please upload a document that is 8 MB or smaller.';
  }
  return '';
}

function apiErrorMessage(status: number, payload: ApiErrorPayload | null | undefined, fallback: string) {
  if (status === 401 && (!payload?.detail || payload?.detail === 'Authentication required')) {
    return 'Your session expired. Please log in again and retry.';
  }
  if (status === 403 && payload?.detail === 'Access denied') {
    return 'Your session expired. Please log in again and retry.';
  }
  if (status === 428) {
    return 'You have not set a document passkey yet. Set one to unlock your vault.';
  }
  if (Array.isArray(payload?.detail)) {
    const message = payload.detail
      .map((item) => item?.msg || '')
      .filter(Boolean)
      .join(' ');
    if (message) return message;
  }
  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }
  return payload?.error || fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Carries the HTTP status so callers can react to it (e.g. 428 = no passkey set yet). */
class VaultApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'VaultApiError';
    this.status = status;
  }
}

function throwIfNotOk(res: Response, payload: ApiErrorPayload | null | undefined, fallback: string) {
  if (res.ok) return;
  throw new VaultApiError(res.status, apiErrorMessage(res.status, payload, fallback));
}

function buildEditValues(docType: DocType, current: Record<string, string | number | null>) {
  const values: Record<string, string> = {};
  for (const field of editableFieldsFor(docType)) {
    values[field] = current[field] === null || current[field] === undefined ? '' : String(current[field]);
  }
  for (const [key, value] of Object.entries(current)) {
    if (!(key in values)) {
      values[key] = value === null || value === undefined ? '' : String(value);
    }
  }
  return values;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function NoticeBanner({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const isError = tone === 'error';

  return (
    <div
      className={`rounded-[24px] border px-4 py-3.5 sm:px-5 ${
        isError ? 'border-red-200 bg-red-50/80' : 'border-emerald-200 bg-emerald-50/80'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
            isError ? 'bg-white text-red-600' : 'bg-white text-emerald-600'
          }`}
        >
          {isError ? <AlertTriangle className="h-4.5 w-4.5" /> : <CheckCircle2 className="h-4.5 w-4.5" />}
        </div>
        <div>
          <div className={`text-sm font-semibold ${isError ? 'text-red-700' : 'text-emerald-700'}`}>
            {isError ? 'Vault action blocked' : 'Vault updated'}
          </div>
          <p className={`mt-0.5 text-sm ${isError ? 'text-red-700/90' : 'text-emerald-700/90'}`}>{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const router = useRouter();
  const { asPath, isReady, replace } = router;
  const initialVaultPathRef = useRef(
    typeof window === 'undefined' ? '/documents' : `${window.location.pathname}${window.location.search}`,
  );
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [docType, setDocType] = useState<DocType>('pan');
  const [customLabel, setCustomLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCustomLabel, setEditingCustomLabel] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [editingPasskey, setEditingPasskey] = useState('');
  const [focusedDocumentId, setFocusedDocumentId] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [vaultAction, setVaultAction] = useState<VaultActionState | null>(null);
  const [vaultActionBusy, setVaultActionBusy] = useState(false);
  // null while the status is still unknown, so the button can stay neutral.
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [passkeyForm, setPasskeyForm] = useState<PasskeyFormState | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const loadDocuments = useCallback(async (activePhone: string, authToken: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildProxyApiPath(`documents/${encodeURIComponent(activePhone)}`), buildBackendRequestInit({
        headers: { Authorization: `Bearer ${authToken}` },
      }));
      const data = await res.json() as { documents?: VaultDocument[] } & ApiErrorPayload;
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to load documents.'));
      const nextFocusedId = getFocusedDocumentId(
        typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`,
      );
      const loadedDocuments = orderDocumentsWithFocusFirst(data.documents || [], nextFocusedId);
      setDocuments(loadedDocuments);
      if (nextFocusedId && !loadedDocuments.some((doc: VaultDocument) => doc.id === nextFocusedId)) {
        setNotice('Requested document was not found in your vault.');
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to load documents'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPasskeyStatus = useCallback(async (authToken: string) => {
    try {
      const res = await fetch(buildProxyApiPath('documents/passkey-status'), buildBackendRequestInit({
        headers: { Authorization: `Bearer ${authToken}` },
      }));
      if (!res.ok) return;
      const data = await res.json() as { has_passkey?: boolean };
      setHasPasskey(Boolean(data.has_passkey));
    } catch {
      // Advisory only: the passkey dialog still works if this lookup fails.
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const savedToken = localStorage.getItem('govbot_token') || '';
    const savedPhone = localStorage.getItem('govbot_phone') || '';
    if (!savedToken || !savedPhone) {
      const requestedPath = initialVaultPathRef.current.startsWith('/documents')
        ? initialVaultPathRef.current
        : '/documents';
      void replace({
        pathname: '/login',
        query: { next: requestedPath },
      });
      return;
    }
    setToken(savedToken);
    setPhone(savedPhone);
    void loadDocuments(savedPhone, savedToken);
    void loadPasskeyStatus(savedToken);
  }, [isReady, loadDocuments, loadPasskeyStatus, replace]);

  useEffect(() => {
    if (!isReady) return;
    const nextFocusedId = getFocusedDocumentId(asPath);
    setFocusedDocumentId(nextFocusedId);
    if (!nextFocusedId) return;
    setDocuments((prev) => orderDocumentsWithFocusFirst(prev, nextFocusedId));
  }, [asPath, isReady]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateClientFile(file);
    if (validationError) {
      setSelectedFile(null);
      setPreviewName('');
      setError(validationError);
      setNotice('');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    setPreviewName(file.name);
    setError('');
    setNotice('');
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !phone || !token) {
      setError('Choose a file first');
      return;
    }
    const normalizedCustomLabel = normalizeCustomLabel(customLabel);
    if (isCustomDocumentType(docType)) {
      const customLabelError = validateCustomLabel(customLabel);
      if (customLabelError) {
        setError(customLabelError);
        setNotice('');
        return;
      }
    }
    const validationError = validateClientFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError('');
    setNotice('');

    try {
      const imageB64 = await fileToBase64(selectedFile);

      const res = await fetch(buildProxyApiPath('documents/upload'), buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone,
          doc_type: docType,
          custom_label: isCustomDocumentType(docType) ? normalizedCustomLabel : undefined,
          source: 'web',
          image_b64: imageB64,
          file_name: selectedFile.name,
          mime_type: selectedFile.type || 'image/jpeg',
        }),
      }));

      const data = await res.json() as ApiErrorPayload;
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Upload failed.'));

      setSelectedFile(null);
      setPreviewName('');
      if (isCustomDocumentType(docType)) {
        setCustomLabel('');
      }
      setNotice(`${prettyLabel(docType, normalizedCustomLabel)} saved to your vault.`);
      await loadDocuments(phone, token);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  function requestVaultAction(action: VaultActionKind, doc: VaultDocument) {
    setVaultAction({
      action,
      documentId: doc.id,
      documentLabel: prettyLabel(doc.doc_type, doc.custom_label),
      docType: doc.doc_type,
      passkey: '',
      error: '',
    });
    setError('');
    setNotice('');
  }

  function closeVaultAction() {
    if (vaultActionBusy) return;
    setVaultAction(null);
  }

  function updateVaultPasskey(value: string) {
    setVaultAction((current) => (
      current
        ? {
          ...current,
          passkey: value.replace(/\D/g, '').slice(0, 4),
          error: '',
        }
        : current
    ));
  }

  function openPasskeyForm() {
    setPasskeyForm({ newPasskey: '', confirmPasskey: '', currentPasskey: '', error: '' });
    setError('');
    setNotice('');
  }

  function closePasskeyForm() {
    if (passkeyBusy) return;
    setPasskeyForm(null);
  }

  function updatePasskeyField(field: 'newPasskey' | 'confirmPasskey' | 'currentPasskey', value: string) {
    setPasskeyForm((current) => (
      current
        ? { ...current, [field]: value.replace(/\D/g, '').slice(0, 4), error: '' }
        : current
    ));
  }

  async function submitPasskey(e?: React.FormEvent) {
    e?.preventDefault();
    if (!token || !passkeyForm) return;

    const newPasskey = passkeyForm.newPasskey.trim();
    const confirmPasskey = passkeyForm.confirmPasskey.trim();
    const currentPasskey = passkeyForm.currentPasskey.trim();
    const failWith = (message: string) => {
      setPasskeyForm((current) => (current ? { ...current, error: message } : current));
    };

    if (!/^\d{4}$/.test(newPasskey)) {
      failWith('Passkey must be exactly 4 digits.');
      return;
    }
    if (newPasskey !== confirmPasskey) {
      failWith('The two passkeys do not match.');
      return;
    }
    // Changing an existing passkey requires proving you know the current one.
    if (hasPasskey && !/^\d{4}$/.test(currentPasskey)) {
      failWith('Enter your current 4-digit passkey to change it.');
      return;
    }

    setPasskeyBusy(true);
    try {
      const res = await fetch(buildProxyApiPath('documents/passkey'), buildBackendRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_passkey: newPasskey,
          current_passkey: hasPasskey ? currentPasskey : undefined,
        }),
      }));
      const data = await res.json() as ApiErrorPayload;
      throwIfNotOk(res, data, 'Failed to save passkey.');
      setHasPasskey(true);
      setPasskeyForm(null);
      setNotice('Passkey saved. Use it to unlock your vault here or in WhatsApp.');
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to save passkey');
      // The status lookup can fail or go stale. If the backend says a passkey already
      // exists, reveal the current-passkey field rather than leaving a dead end.
      if (
        error instanceof VaultApiError
        && error.status === 401
        && hasPasskey !== true
        && !message.startsWith('Your session expired')
      ) {
        setHasPasskey(true);
      }
      failWith(message);
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function submitVaultAction(e?: React.FormEvent) {
    e?.preventDefault();
    if (!token || !vaultAction) return;

    const passkey = vaultAction.passkey.trim();
    if (!/^\d{4}$/.test(passkey)) {
      setVaultAction((current) => (current ? {
        ...current,
        error: 'Enter your 4-digit vault passkey.',
      } : current));
      return;
    }

    const { action, documentId, docType } = vaultAction;
    setVaultActionBusy(true);
    setError('');
    setNotice('');

    try {
      if (action === 'preview') {
        const res = await fetch(buildProxyApiPath(`documents/item/${documentId}/view-url`), buildBackendRequestInit({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Document-Passkey': passkey,
          },
        }));
        const data = await res.json() as { view_url?: string } & ApiErrorPayload;
        throwIfNotOk(res, data, 'Preview unavailable.');
        setVaultAction(null);
        window.open(data.view_url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'download') {
        setDownloadingId(documentId);
        const res = await fetch(buildProxyApiPath(`documents/item/${documentId}/download-url`), buildBackendRequestInit({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Document-Passkey': passkey,
          },
        }));
        const data = await res.json() as { download_url?: string } & ApiErrorPayload;
        throwIfNotOk(res, data, 'Download unavailable.');
        setVaultAction(null);
        window.open(data.download_url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'edit') {
        setLoadingEditId(documentId);
        const res = await fetch(buildProxyApiPath(`documents/item/${documentId}`), buildBackendRequestInit({
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Document-Passkey': passkey,
          },
        }));
        const data = await res.json() as {
          extracted_data?: Record<string, string | number | null>;
          custom_label?: string | null;
        } & ApiErrorPayload;
        throwIfNotOk(res, data, 'Failed to open document details.');
        const current = data.extracted_data || {};
        setEditingId(documentId);
        setEditingPasskey(passkey);
        setEditingCustomLabel(isCustomDocumentType(docType) ? String(data.custom_label || '') : '');
        setEditValues(buildEditValues(docType, current));
        setVaultAction(null);
        return;
      }

      setDeletingId(documentId);
      const res = await fetch(buildProxyApiPath(`documents/item/${documentId}`), buildBackendRequestInit({
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Document-Passkey': passkey,
        },
      }));
      const data = await res.json() as ApiErrorPayload;
      throwIfNotOk(res, data, 'Failed to delete document.');
      setVaultAction(null);
      setNotice('Document deleted.');
      if (editingId === documentId) cancelEditing();
      await loadDocuments(phone, token);
    } catch (error: unknown) {
      const message = getErrorMessage(
        error,
        action === 'preview'
          ? 'Preview unavailable'
          : action === 'download'
            ? 'Download unavailable'
            : action === 'edit'
              ? 'Failed to open document details.'
              : 'Failed to delete document',
      );
      // 428 means no passkey exists yet — asking again for one they never set is a
      // dead end, so swap straight to the dialog that creates it.
      if (error instanceof VaultApiError && error.status === 428) {
        setHasPasskey(false);
        setVaultAction(null);
        openPasskeyForm();
        setError(message);
        return;
      }
      setVaultAction((current) => (current ? { ...current, error: message } : current));
    } finally {
      setVaultActionBusy(false);
      setDownloadingId(null);
      setLoadingEditId(null);
      setDeletingId(null);
    }
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingCustomLabel('');
    setEditingPasskey('');
    setEditValues({});
  }

  async function saveEdit(documentId: string) {
    if (!token) return;
    const activeDocument = documents.find((item) => item.id === documentId);
    if (activeDocument && isCustomDocumentType(activeDocument.doc_type)) {
      const customLabelError = validateCustomLabel(editingCustomLabel);
      if (customLabelError) {
        setError(customLabelError);
        return;
      }
    }
    setSavingEdit(true);
    setError('');
    try {
      const res = await fetch(buildProxyApiPath(`documents/item/${documentId}`), buildBackendRequestInit({
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Document-Passkey': editingPasskey,
        },
        body: JSON.stringify({
          extracted_data: editValues,
          custom_label: activeDocument && isCustomDocumentType(activeDocument.doc_type)
            ? normalizeCustomLabel(editingCustomLabel)
            : undefined,
        }),
      }));
      const data = await res.json() as ApiErrorPayload;
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to save edits.'));
      setNotice('Document details updated.');
      cancelEditing();
      await loadDocuments(phone, token);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to save edits'));
    } finally {
      setSavingEdit(false);
    }
  }

  const activeVaultAction = vaultAction
    ? describeVaultAction(vaultAction.action, vaultAction.documentLabel)
    : null;
  const selectedDocMeta = getDocumentTypeMeta(docType);

  const vaultActionBusyLabel = vaultAction
    ? {
      preview: 'Opening preview...',
      download: 'Preparing download...',
      edit: 'Unlocking fields...',
      delete: 'Deleting document...',
    }[vaultAction.action]
    : 'Working...';

  return (
    <>
      <Head>
        <title>Document Vault | GovBot</title>
        <meta name="description" content="Upload and manage PAN, Aadhaar, scholarship records, and custom documents in your GovBot KYC vault." />
      </Head>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
              ← Back to Services
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Unified KYC Vault
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-2 max-w-2xl">
              Save your identity and scholarship documents once, preview them securely, and let GovBot reuse them across flows.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-orange-500 font-semibold">Vault Owner</div>
              <div className="text-sm font-semibold text-slate-800">{phone || 'Loading...'}</div>
            </div>
            <button
              type="button"
              onClick={openPasskeyForm}
              className="mt-2 inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {hasPasskey === false ? 'Set passkey' : 'Change passkey'}
            </button>
          </div>
        </div>

        {(notice || error) && (
          <div className="mb-6 space-y-3">
            {notice && <NoticeBanner tone="success" message={notice} />}
            {error && <NoticeBanner tone="error" message={error} />}
          </div>
        )}

        <div className="grid lg:grid-cols-[1.2fr,1.8fr] gap-6">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Upload Document</h2>
                <p className="text-sm text-slate-500 mt-1">Choose a type, add the file, and GovBot will extract the essentials.</p>
              </div>
              <div className="text-3xl">🗂️</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {DOCUMENT_TYPE_OPTIONS.map(doc => (
                <button
                  key={doc.value}
                  type="button"
                  onClick={() => setDocType(doc.value as DocType)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    docType === doc.value
                      ? 'border-[#ff9933] bg-orange-50 shadow-sm'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="text-2xl mb-2">{doc.icon}</div>
                  <div className="text-sm font-semibold text-slate-900">{doc.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{doc.hint}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              {isCustomDocumentType(docType) && (
                <label className="block">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Document name
                  </div>
                  <input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. Domicile Certificate"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-[#ff9933] focus:bg-white"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Use the same name you would ask for on WhatsApp so GovBot can find this document later.
                  </p>
                </label>
              )}

              <label className="block rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center hover:border-[#ff9933]/50 transition-colors cursor-pointer">
                <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={handleFileChange} />
                <div className="text-4xl mb-3">{selectedDocMeta.icon}</div>
                <div className="text-sm font-semibold text-slate-700">
                  {previewName ? previewName : getDocumentUploadPrompt(docType, customLabel)}
                </div>
                <div className="text-xs text-slate-400 mt-1">JPG, PNG, or PDF only. Max file size 8 MB.</div>
              </label>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                PAN and Aadhaar numbers stay masked in the list view. Custom documents keep a short summary ready for WhatsApp and web lookup.
              </div>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="w-full rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/60 transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {uploading ? 'Saving to vault...' : `Upload ${prettyLabel(docType, customLabel)}`}
              </button>
            </form>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Stored Documents</h2>
                <p className="text-sm text-slate-500 mt-1">Latest uploads, extraction confidence, and document validity in one place.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadDocuments(phone, token)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-10 text-center">
                <div className="text-3xl mb-3">🗃️</div>
                <div className="text-sm font-semibold text-slate-700">Loading your vault</div>
                <div className="text-xs text-slate-500 mt-1">Fetching saved documents and masked summaries.</div>
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-10 text-center">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-sm font-semibold text-slate-700">No documents saved yet</div>
                <div className="text-xs text-slate-500 mt-1">Upload PAN, Aadhaar, scholarship records, or custom documents from the left panel to start your vault.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className={`rounded-3xl border p-5 ${
                      doc.id === focusedDocumentId
                        ? 'border-orange-200 bg-orange-50/60'
                        : 'border-slate-100 bg-slate-50/70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{prettyLabel(doc.doc_type, doc.custom_label)}</span>
                          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {doc.source}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            doc.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                            doc.status === 'needs_review' ? 'bg-amber-100 text-amber-700' :
                            doc.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-slate-200 text-slate-600'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Verification: {doc.verification_status} {doc.confidence !== undefined ? `• Confidence ${(Number(doc.confidence) * 100).toFixed(0)}%` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => requestVaultAction('preview', doc)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVaultAction('download', doc)}
                          disabled={downloadingId === doc.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                        >
                          {downloadingId === doc.id ? 'Downloading...' : 'Download'}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVaultAction('edit', doc)}
                          disabled={loadingEditId === doc.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          {loadingEditId === doc.id ? 'Opening...' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVaultAction('delete', doc)}
                          disabled={deletingId === doc.id}
                          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {(doc.issue_date || doc.expiry_date) && (
                      <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-500">
                        {doc.issue_date && <span>Issued: {doc.issue_date}</span>}
                        {doc.expiry_date && <span>Expires: {doc.expiry_date}</span>}
                      </div>
                    )}

                    {editingId === doc.id ? (
                      <div className="mt-4 space-y-3">
                        {isCustomDocumentType(doc.doc_type) && (
                          <label className="block rounded-2xl bg-white px-4 py-3 text-sm">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
                              Document Name
                            </div>
                            <input
                              value={editingCustomLabel}
                              onChange={(e) => setEditingCustomLabel(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#ff9933] focus:outline-none"
                            />
                          </label>
                        )}
                        <div className="grid sm:grid-cols-2 gap-3">
                        {Object.keys(editValues).map((key) => (
                          <label key={key} className="rounded-2xl bg-white px-4 py-3 text-sm">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
                              {prettyFieldName(key)}
                            </div>
                            <input
                              value={editValues[key] ?? ''}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#ff9933] focus:outline-none"
                            />
                          </label>
                        ))}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(doc.id)}
                            disabled={savingEdit}
                            className="rounded-xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-200/50 disabled:opacity-50"
                          >
                            {savingEdit ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      doc.extracted_data && Object.keys(doc.extracted_data).length > 0 && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-4">
                          {Object.entries(doc.extracted_data).map(([key, value]) => (
                            value !== null && value !== '' ? (
                              <div key={key} className="rounded-2xl bg-white px-4 py-3">
                                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                                  {prettyFieldName(key)}
                                </div>
                                <div className="text-sm font-medium text-slate-800 mt-1 break-words">{String(value)}</div>
                              </div>
                            ) : null
                          ))}
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </div>

        <AnimatePresence>
          {passkeyForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.5)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#ff9933]">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        {hasPasskey ? 'Change vault passkey' : 'Set vault passkey'}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {hasPasskey
                          ? 'Enter your current passkey, then choose a new 4-digit passkey.'
                          : 'Choose a 4-digit passkey to protect your documents. It works here and in WhatsApp.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closePasskeyForm}
                    disabled={passkeyBusy}
                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600 disabled:opacity-50"
                    aria-label="Close passkey dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={submitPasskey} className="mt-6 space-y-4">
                  {hasPasskey && (
                    <label className="block">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Current passkey
                      </div>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoFocus
                        maxLength={4}
                        value={passkeyForm.currentPasskey}
                        onChange={(e) => updatePasskeyField('currentPasskey', e.target.value)}
                        placeholder="Current passkey"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition-colors focus:border-[#ff9933] focus:bg-white"
                      />
                    </label>
                  )}

                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      New 4-digit passkey
                    </div>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus={!hasPasskey}
                      maxLength={4}
                      value={passkeyForm.newPasskey}
                      onChange={(e) => updatePasskeyField('newPasskey', e.target.value)}
                      placeholder="New passkey"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition-colors focus:border-[#ff9933] focus:bg-white"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Confirm new passkey
                    </div>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={passkeyForm.confirmPasskey}
                      onChange={(e) => updatePasskeyField('confirmPasskey', e.target.value)}
                      placeholder="Re-enter passkey"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition-colors focus:border-[#ff9933] focus:bg-white"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      This is the same passkey GovBot asks for in WhatsApp.
                    </p>
                  </label>

                  {passkeyForm.error && <NoticeBanner tone="error" message={passkeyForm.error} />}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closePasskeyForm}
                      disabled={passkeyBusy}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={passkeyBusy}
                      className="rounded-2xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {passkeyBusy ? 'Saving passkey...' : hasPasskey ? 'Update passkey' : 'Save passkey'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}

          {vaultAction && activeVaultAction && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.5)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        activeVaultAction.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-[#ff9933]'
                      }`}
                    >
                      {activeVaultAction.tone === 'danger' ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Lock className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        {activeVaultAction.title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">{activeVaultAction.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeVaultAction}
                    disabled={vaultActionBusy}
                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600 disabled:opacity-50"
                    aria-label="Close vault action"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={submitVaultAction} className="mt-6 space-y-4">
                  {activeVaultAction.tone === 'danger' && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      This action removes the stored file and extracted fields for this document.
                    </div>
                  )}

                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      4-digit passkey
                    </div>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      maxLength={4}
                      value={vaultAction.passkey}
                      onChange={(e) => updateVaultPasskey(e.target.value)}
                      placeholder="Enter passkey"
                      className={`w-full rounded-2xl border px-4 py-3 text-base text-slate-900 outline-none transition-colors ${
                        vaultAction.error
                          ? 'border-red-200 bg-red-50/40 focus:border-red-300'
                          : 'border-slate-200 bg-slate-50 focus:border-[#ff9933] focus:bg-white'
                      }`}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      The same passkey works in WhatsApp and here.
                    </p>
                  </label>

                  {vaultAction.error && <NoticeBanner tone="error" message={vaultAction.error} />}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeVaultAction}
                      disabled={vaultActionBusy}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={vaultActionBusy}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-transform disabled:opacity-50 disabled:hover:translate-y-0 ${
                        activeVaultAction.tone === 'danger'
                          ? 'bg-red-600 hover:-translate-y-0.5 hover:bg-red-700'
                          : 'bg-gradient-to-r from-[#ff9933] to-[#e67e00] hover:-translate-y-0.5'
                      }`}
                    >
                      {vaultActionBusy ? vaultActionBusyLabel : activeVaultAction.confirmLabel}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
