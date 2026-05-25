import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDocumentLabel,
  getDocumentUploadPrompt,
  describeVaultAction,
  getFocusedDocumentId,
  orderDocumentsWithFocusFirst,
} from './documentVault.mjs';

test('getFocusedDocumentId reads the document query param', () => {
  assert.equal(getFocusedDocumentId('/documents?document=doc-pan-1'), 'doc-pan-1');
  assert.equal(getFocusedDocumentId('/documents'), '');
});

test('orderDocumentsWithFocusFirst keeps the focused document first', () => {
  const docs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    orderDocumentsWithFocusFirst(docs, 'b').map((doc) => doc.id),
    ['b', 'a', 'c'],
  );
});

test('describeVaultAction returns themed copy for safe and destructive actions', () => {
  assert.deepEqual(describeVaultAction('preview', 'PAN Card'), {
    title: 'Preview PAN Card',
    description: 'Enter your 4-digit passkey to open the full document in a new tab.',
    confirmLabel: 'Open Preview',
    tone: 'default',
  });

  assert.deepEqual(describeVaultAction('delete', 'Aadhaar Card'), {
    title: 'Delete Aadhaar Card',
    description: 'Enter your 4-digit passkey to permanently remove this file and its extracted details from the vault.',
    confirmLabel: 'Delete Document',
    tone: 'danger',
  });
});

test('getDocumentLabel prefers saved custom labels for custom documents', () => {
  assert.equal(
    getDocumentLabel({ doc_type: 'custom', custom_label: 'Domicile Certificate' }),
    'Domicile Certificate',
  );
  assert.equal(getDocumentLabel({ doc_type: 'custom' }), 'Custom Document');
});

test('getDocumentUploadPrompt uses the custom label when present', () => {
  assert.equal(
    getDocumentUploadPrompt('custom', 'Residence Proof'),
    'Choose Residence Proof',
  );
  assert.equal(
    getDocumentUploadPrompt('pan'),
    'Choose your PAN Card',
  );
});
