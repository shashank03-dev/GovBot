import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { buildBackendRequestInit, buildProxyApiPath } from '@/lib/backendApi.mjs';
const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'] as const;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type DocType = 'pan' | 'aadhaar' | 'income_cert' | 'caste_cert' | 'marksheet';

type VaultDocument = {
  id: string;
  phone: string;
  doc_type: DocType;
  source: string;
  status: string;
  verification_status: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  confidence?: number;
  created_at?: string;
  extracted_data?: Record<string, string | number | null>;
};

const DOC_TYPES: Array<{ value: DocType; label: string; icon: string; hint: string }> = [
  { value: 'pan', label: 'PAN Card', icon: '🪪', hint: 'Number, name, father name, DOB' },
  { value: 'aadhaar', label: 'Aadhaar Card', icon: '🆔', hint: 'Identity details + address' },
  { value: 'income_cert', label: 'Income Certificate', icon: '💰', hint: 'Income proof for schemes' },
  { value: 'caste_cert', label: 'Caste Certificate', icon: '📜', hint: 'Category verification' },
  { value: 'marksheet', label: 'Marksheet', icon: '📘', hint: 'Academic history' },
];

function prettyLabel(docType: string) {
  return DOC_TYPES.find(doc => doc.value === docType)?.label || docType.replace(/_/g, ' ');
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
  };
  return defaults[docType];
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

function apiErrorMessage(status: number, payload: any, fallback: string) {
  if (status === 401 && (!payload?.detail || payload?.detail === 'Authentication required')) {
    return 'Your session expired. Please log in again and retry.';
  }
  if (status === 403 && payload?.detail === 'Access denied') {
    return 'Your session expired. Please log in again and retry.';
  }
  return payload?.detail || payload?.error || fallback;
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

export default function DocumentsPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [docType, setDocType] = useState<DocType>('pan');
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [editingPasskey, setEditingPasskey] = useState('');

  useEffect(() => {
    const savedToken = localStorage.getItem('govbot_token') || '';
    const savedPhone = localStorage.getItem('govbot_phone') || '';
    if (!savedToken || !savedPhone) {
      router.push('/login');
      return;
    }
    setToken(savedToken);
    setPhone(savedPhone);
    void loadDocuments(savedPhone, savedToken);
  }, [router]);

  async function loadDocuments(activePhone: string, authToken: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildProxyApiPath(`documents/${encodeURIComponent(activePhone)}`), buildBackendRequestInit({
        headers: { Authorization: `Bearer ${authToken}` },
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to load documents.'));
      setDocuments(data.documents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

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
          source: 'web',
          image_b64: imageB64,
          file_name: selectedFile.name,
          mime_type: selectedFile.type || 'image/jpeg',
        }),
      }));

      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Upload failed.'));

      setSelectedFile(null);
      setPreviewName('');
      setNotice(`${prettyLabel(docType)} saved to your vault.`);
      await loadDocuments(phone, token);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function openPreview(documentId: string) {
    if (!token) return;
    const passkey = window.prompt('Enter your 4-digit passkey to preview this document:')?.trim() || '';
    if (!passkey) return;
    try {
      const res = await fetch(buildProxyApiPath(`documents/item/${documentId}/signed-url`), buildBackendRequestInit({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Document-Passkey': passkey,
        },
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Preview unavailable.'));
      window.open(data.signed_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err.message || 'Preview unavailable');
    }
  }

  async function startEditing(doc: VaultDocument) {
    if (!token) return;
    const passkey = window.prompt('Enter your 4-digit passkey to edit this document:')?.trim() || '';
    if (!passkey) return;
    setLoadingEditId(doc.id);
    setError('');
    setNotice('');
    try {
      const res = await fetch(buildProxyApiPath(`documents/item/${doc.id}`), buildBackendRequestInit({
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Document-Passkey': passkey,
        },
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to open document details.'));
      const current = data.extracted_data || {};
      setEditingId(doc.id);
      setEditingPasskey(passkey);
      setEditValues(buildEditValues(doc.doc_type, current));
    } catch (err: any) {
      setError(err.message || 'Failed to open document details.');
    } finally {
      setLoadingEditId(null);
    }
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingPasskey('');
    setEditValues({});
  }

  async function saveEdit(documentId: string) {
    if (!token) return;
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
        body: JSON.stringify({ extracted_data: editValues }),
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to save edits.'));
      setNotice('Document details updated.');
      cancelEditing();
      await loadDocuments(phone, token);
    } catch (err: any) {
      setError(err.message || 'Failed to save edits');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteDocument(documentId: string) {
    if (!token) return;
    const confirmed = window.confirm('Delete this document from the vault?');
    if (!confirmed) return;
    const passkey = window.prompt('Enter your 4-digit passkey to delete this document:')?.trim() || '';
    if (!passkey) return;
    setDeletingId(documentId);
    setError('');
    try {
      const res = await fetch(buildProxyApiPath(`documents/item/${documentId}`), buildBackendRequestInit({
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Document-Passkey': passkey,
        },
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(res.status, data, 'Failed to delete document.'));
      setNotice('Document deleted.');
      if (editingId === documentId) cancelEditing();
      await loadDocuments(phone, token);
    } catch (err: any) {
      setError(err.message || 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Head>
        <title>Document Vault | GovBot</title>
        <meta name="description" content="Upload and manage PAN, Aadhaar, and scholarship documents in your GovBot KYC vault." />
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
          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-orange-500 font-semibold">Vault Owner</div>
            <div className="text-sm font-semibold text-slate-800">{phone || 'Loading...'}</div>
          </div>
        </div>

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
              {DOC_TYPES.map(doc => (
                <button
                  key={doc.value}
                  type="button"
                  onClick={() => setDocType(doc.value)}
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
              <label className="block rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center hover:border-[#ff9933]/50 transition-colors cursor-pointer">
                <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={handleFileChange} />
                <div className="text-4xl mb-3">{DOC_TYPES.find(doc => doc.value === docType)?.icon}</div>
                <div className="text-sm font-semibold text-slate-700">
                  {previewName ? previewName : `Choose your ${prettyLabel(docType)}`}
                </div>
                <div className="text-xs text-slate-400 mt-1">JPG, PNG, or PDF only. Max file size 8 MB.</div>
              </label>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                PAN and Aadhaar numbers stay masked in the list view. Use Preview or Edit when you need the full document details.
              </div>

              {notice && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
              {error && <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="w-full rounded-2xl bg-[#1f2937] px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {uploading ? 'Saving to vault...' : `Upload ${prettyLabel(docType)}`}
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
                <div className="text-xs text-slate-500 mt-1">Upload PAN, Aadhaar, or scholarship records from the left panel to start your vault.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map(doc => (
                  <div key={doc.id} className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{prettyLabel(doc.doc_type)}</span>
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
                          onClick={() => void openPreview(doc.id)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => void startEditing(doc)}
                          disabled={loadingEditId === doc.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          {loadingEditId === doc.id ? 'Opening...' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteDocument(doc.id)}
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
                      <div className="grid sm:grid-cols-2 gap-3 mt-4">
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
                        <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(doc.id)}
                            disabled={savingEdit}
                            className="rounded-xl bg-[#1f2937] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
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
      </div>
    </>
  );
}
