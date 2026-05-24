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
