import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDocumentLabel,
  getDocumentUploadPrompt,
  buildPortalDocumentChecklist,
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

test('buildPortalDocumentChecklist lists missing required NSP documents', () => {
  const checklist = buildPortalDocumentChecklist('nsp', [
    { id: 'doc-aadhaar', doc_type: 'aadhaar', status: 'ready' },
  ]);

  assert.equal(checklist.isComplete, false);
  assert.deepEqual(
    checklist.missingRequiredDocuments.map((item) => item.docType),
    ['income_cert', 'marksheet'],
  );
  assert.deepEqual(
    checklist.readyRequiredDocuments.map((item) => item.docType),
    ['aadhaar'],
  );
});

test('buildPortalDocumentChecklist accepts DigiLocker document type names', () => {
  const checklist = buildPortalDocumentChecklist('ssp', [
    { id: 'doc-aadhaar', doc_type: 'aadhaar', status: 'ready' },
    { id: 'doc-income', doc_type: 'income_certificate', status: 'ready' },
    { id: 'doc-caste', doc_type: 'caste_certificate', status: 'ready' },
    { id: 'doc-marks', doc_type: 'marksheet', status: 'ready' },
  ]);

  assert.equal(checklist.isComplete, true);
  assert.deepEqual(checklist.missingRequiredDocuments, []);
});

test('buildPortalDocumentChecklist asks users to review unreadable fetched documents', () => {
  const checklist = buildPortalDocumentChecklist('nsp', [
    { id: 'doc-aadhaar', doc_type: 'aadhaar', status: 'ready' },
    { id: 'doc-income', doc_type: 'income_cert', status: 'needs_review' },
    { id: 'doc-marks', doc_type: 'marksheet', verification_status: 'invalid' },
  ]);

  assert.equal(checklist.isComplete, false);
  assert.deepEqual(
    checklist.reviewRequiredDocuments.map((item) => item.docType),
    ['income_cert', 'marksheet'],
  );
});

test('buildPortalDocumentChecklist accepts user-reviewed ready documents with inconclusive secondary verification', () => {
  const checklist = buildPortalDocumentChecklist('ssp', [
    { id: 'doc-aadhaar', doc_type: 'aadhaar', status: 'ready', verification_status: 'unknown' },
    { id: 'doc-income', doc_type: 'income_cert', status: 'ready', verification_status: 'unknown', edited_by_user: true },
    { id: 'doc-caste', doc_type: 'caste_cert', status: 'ready', verification_status: 'unknown', edited_by_user: true },
    { id: 'doc-marks', doc_type: 'marksheet', status: 'ready', verification_status: 'unknown', edited_by_user: true },
  ]);

  assert.equal(checklist.isComplete, true);
  assert.deepEqual(checklist.reviewRequiredDocuments, []);
  assert.deepEqual(
    checklist.readyRequiredDocuments.map((item) => item.docType),
    ['aadhaar', 'income_cert', 'caste_cert', 'marksheet'],
  );
});
