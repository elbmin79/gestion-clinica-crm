import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECORD_FILE_BYTES, validatePatientRecordFile, validatePatientRecordFileContent } from './patient-record-files.js';

test('accepts supported record-file types up to the 10 MB limit', () => {
  for (const type of ['application/pdf', 'image/jpeg', 'image/png']) {
    assert.equal(validatePatientRecordFile({ type, size: MAX_RECORD_FILE_BYTES }), '');
  }
});

test('checks the file signature instead of trusting only its extension or MIME type', async () => {
  const pdf = new Blob(['%PDF-1.7 fixture'], { type: 'application/pdf' });
  const fakePdf = new Blob(['<html>not a pdf</html>'], { type: 'application/pdf' });
  assert.equal(await validatePatientRecordFileContent(pdf), '');
  assert.match(await validatePatientRecordFileContent(fakePdf), /no coincide/);
});

test('rejects missing, empty, oversized, and unsupported files', () => {
  assert.match(validatePatientRecordFile(null), /Selecciona/);
  assert.match(validatePatientRecordFile({ type: 'application/pdf', size: 0 }), /pesar/);
  assert.match(validatePatientRecordFile({ type: 'application/pdf', size: MAX_RECORD_FILE_BYTES + 1 }), /10 MB/);
  assert.match(validatePatientRecordFile({ type: 'text/html', size: 100 }), /PDF, JPG o PNG/);
});
