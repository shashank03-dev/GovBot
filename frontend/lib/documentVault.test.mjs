import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
