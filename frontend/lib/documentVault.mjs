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
