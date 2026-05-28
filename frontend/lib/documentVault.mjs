export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'pan', label: 'PAN Card', icon: '🪪', hint: 'Number, name, father name, DOB' },
  { value: 'aadhaar', label: 'Aadhaar Card', icon: '🆔', hint: 'Identity details + address' },
  { value: 'income_cert', label: 'Income Certificate', icon: '💰', hint: 'Income proof for schemes' },
  { value: 'caste_cert', label: 'Caste Certificate', icon: '📜', hint: 'Category verification' },
  { value: 'marksheet', label: 'Marksheet', icon: '📘', hint: 'Academic history' },
  { value: 'custom', label: 'Custom Document', icon: '🗂️', hint: 'Any other document with a custom name and summary' },
];

const PORTAL_DOCUMENT_REQUIREMENTS = {
  nsp: ['aadhaar', 'income_cert', 'marksheet'],
  ssp: ['aadhaar', 'income_cert', 'caste_cert', 'marksheet'],
};

const DOCUMENT_TYPE_ALIASES = {
  income_certificate: 'income_cert',
  caste_certificate: 'caste_cert',
  aadhaar_card: 'aadhaar',
};

function prettifyDocumentType(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Document';
}

export function isCustomDocumentType(docType = '') {
  return String(docType || '') === 'custom';
}

export function getDocumentTypeMeta(docType = '') {
  return DOCUMENT_TYPE_OPTIONS.find((doc) => doc.value === docType) || {
    value: docType,
    label: prettifyDocumentType(docType),
    icon: '📄',
    hint: 'Saved document',
  };
}

export function getDocumentLabel(documentOrType = 'document', customLabel = '') {
  const normalizedDocument = typeof documentOrType === 'object' && documentOrType !== null
    ? documentOrType
    : { doc_type: documentOrType, custom_label: customLabel };
  const docType = String(normalizedDocument.doc_type || documentOrType || '');
  if (isCustomDocumentType(docType)) {
    const label = String(normalizedDocument.custom_label || customLabel || '').trim();
    if (label) {
      return label;
    }
  }
  return getDocumentTypeMeta(docType).label;
}

export function getDocumentUploadPrompt(docType = '', customLabel = '') {
  const label = String(customLabel || '').trim();
  if (isCustomDocumentType(docType) && label) {
    return `Choose ${label}`;
  }
  return `Choose your ${getDocumentLabel(docType, customLabel)}`;
}

export function normalizeDocumentType(docType = '') {
  const normalized = String(docType || '').trim().toLowerCase();
  return DOCUMENT_TYPE_ALIASES[normalized] || normalized;
}

function getPortalRequiredDocumentTypes(portal = 'nsp') {
  const normalizedPortal = String(portal || 'nsp').trim().toLowerCase();
  return PORTAL_DOCUMENT_REQUIREMENTS[normalizedPortal] || PORTAL_DOCUMENT_REQUIREMENTS.nsp;
}

function getDocumentChecklistStatus(document) {
  if (!document) return 'missing';

  const status = String(document.status || '').trim().toLowerCase();
  const verificationStatus = String(document.verification_status || '').trim().toLowerCase();

  if (['failed', 'invalid', 'rejected'].includes(status) || ['failed', 'invalid', 'rejected'].includes(verificationStatus)) {
    return 'needs_review';
  }

  if (status === 'needs_review' || verificationStatus === 'unknown') {
    return 'needs_review';
  }

  return 'ready';
}

export function buildPortalDocumentChecklist(portal = 'nsp', documents = []) {
  const documentsByType = new Map();
  for (const document of documents || []) {
    const docType = normalizeDocumentType(document?.doc_type);
    if (!docType || documentsByType.has(docType)) continue;
    documentsByType.set(docType, document);
  }

  const items = getPortalRequiredDocumentTypes(portal).map((docType) => {
    const document = documentsByType.get(docType) || null;
    const status = getDocumentChecklistStatus(document);
    return {
      docType,
      label: getDocumentLabel(docType),
      required: true,
      status,
      document,
    };
  });

  const missingRequiredDocuments = items.filter((item) => item.status === 'missing');
  const reviewRequiredDocuments = items.filter((item) => item.status === 'needs_review');
  const readyRequiredDocuments = items.filter((item) => item.status === 'ready');

  return {
    portal: String(portal || 'nsp').trim().toLowerCase(),
    items,
    missingRequiredDocuments,
    reviewRequiredDocuments,
    readyRequiredDocuments,
    isComplete: missingRequiredDocuments.length === 0 && reviewRequiredDocuments.length === 0,
  };
}

export function getFocusedDocumentId(asPath = '') {
  const value = String(asPath || '');
  const query = value.includes('?') ? value.slice(value.indexOf('?')) : '';
  const params = new URLSearchParams(query);
  return params.get('document') || '';
}

export function orderDocumentsWithFocusFirst(documents = [], focusedId = '') {
  if (!focusedId) {
    return [...documents];
  }

  const next = [...documents];
  next.sort((a, b) => {
    if (a.id === focusedId) return -1;
    if (b.id === focusedId) return 1;
    return 0;
  });
  return next;
}

export function describeVaultAction(action = 'preview', documentLabel = 'Document') {
  const label = String(documentLabel || 'Document');
  const descriptions = {
    preview: {
      title: `Preview ${label}`,
      description: 'Enter your 4-digit passkey to open the full document in a new tab.',
      confirmLabel: 'Open Preview',
      tone: 'default',
    },
    download: {
      title: `Download ${label}`,
      description: 'Enter your 4-digit passkey to generate a secure download link for this file.',
      confirmLabel: 'Download File',
      tone: 'default',
    },
    edit: {
      title: `Edit ${label}`,
      description: 'Enter your 4-digit passkey to unlock the extracted fields for editing.',
      confirmLabel: 'Unlock Fields',
      tone: 'default',
    },
    delete: {
      title: `Delete ${label}`,
      description: 'Enter your 4-digit passkey to permanently remove this file and its extracted details from the vault.',
      confirmLabel: 'Delete Document',
      tone: 'danger',
    },
  };

  return descriptions[action] || descriptions.preview;
}
