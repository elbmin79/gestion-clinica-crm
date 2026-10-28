import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatientDirectoryStore } from './patient-directory.js';

function clientWithAuth() {
  return { auth: { getUser: async () => ({ data: { user: { id: 'user-id' } }, error: null }) } };
}

test('creates a clinical encounter against the patient and appointment database ids', async () => {
  const client = clientWithAuth();
  let inserted;
  client.from = table => {
    assert.equal(table, 'patient_encounters');
    return { insert: row => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: 'encounter-id' }, error: null }) }) }; } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const result = await store.createEncounter('clinic-id', { databaseId: 'patient-id', providerId: 'provider-id' }, {
    appointmentId: 'appointment-id', occurredAt: '2026-10-27T20:00:00.000Z', chiefComplaint: 'Checkup',
    history: 'History', examination: 'Exam', assessment: 'Assessment', plan: 'Plan',
  });
  assert.deepEqual(result, { id: 'encounter-id' });
  assert.deepEqual(inserted, {
    clinic_id: 'clinic-id', patient_id: 'patient-id', appointment_id: 'appointment-id', clinician_id: 'provider-id',
    occurred_at: '2026-10-27T20:00:00.000Z', chief_complaint: 'Checkup', history: 'History',
    examination: 'Exam', assessment: 'Assessment', plan: 'Plan', created_by: 'user-id',
  });
});

test('creates a private Botox treatment record with the session, product, lot, areas, and clinician metadata', async () => {
  const client = clientWithAuth();
  let inserted;
  client.from = table => {
    assert.equal(table, 'botox_treatment_records');
    return { insert: row => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: 'botox-id' }, error: null }) }) }; } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const result = await store.createBotoxTreatment('clinic-id', { databaseId: 'patient-id', providerId: 'provider-id' }, {
    appointmentId: 'appointment-id', performedAt: '2026-10-27T20:00:00.000Z', product: 'Product A',
    lotNumber: 'LOT-42', expirationDate: '2027-06-30', treatmentAreas: 'Area A: 8 units', totalUnits: 8, followUp: 'Review in 2 weeks',
    consentDocumentId: 'consent-id', consentFileId: '',
  });
  assert.deepEqual(result, { id: 'botox-id' });
  assert.deepEqual(inserted, {
    clinic_id: 'clinic-id', patient_id: 'patient-id', appointment_id: 'appointment-id', clinician_id: 'provider-id',
    performed_at: '2026-10-27T20:00:00.000Z', product: 'Product A', lot_number: 'LOT-42',
    expiration_date: '2027-06-30', treatment_areas: 'Area A: 8 units', total_units: 8,
    follow_up: 'Review in 2 weeks', consent_document_id: 'consent-id', consent_file_id: null, created_by: 'user-id',
  });
});

test('uploads a private patient file and returns a short-lived signed-link URL', async () => {
  const client = clientWithAuth();
  const calls = [];
  client.storage = { from: bucket => ({
    upload: async (path, file, options) => { calls.push({ operation: 'upload', bucket, path, size: file.size, options }); return { data: { path }, error: null }; },
    createSignedUrl: async (path, expiresIn) => { calls.push({ operation: 'signed-url', bucket, path, expiresIn }); return { data: { signedUrl: 'https://storage.test/signed' }, error: null }; },
    remove: async paths => { calls.push({ operation: 'remove', bucket, paths }); return { data: paths, error: null }; },
  }) };
  client.from = table => {
    assert.equal(table, 'patient_document_files');
    return { insert: row => { calls.push({ operation: 'metadata', row }); return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) }; } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const uploaded = await store.uploadPatientFile('clinic-id', { databaseId: 'patient-id' }, {
    file: { type: 'application/pdf', size: 51 }, title: 'Consentimiento', kind: 'consent', signedAt: '2026-10-27',
  });
  assert.match(uploaded.storagePath, /^clinic-id\/patient-id\/.+\.pdf$/);
  assert.equal(calls[0].operation, 'upload');
  assert.equal(calls[1].operation, 'metadata');
  assert.equal(calls[1].row.storage_path, uploaded.storagePath);
  assert.equal(await store.openPatientFile(uploaded.storagePath), 'https://storage.test/signed');
  assert.deepEqual(calls[2], { operation: 'signed-url', bucket: 'patient-records', path: uploaded.storagePath, expiresIn: 60 });
});

test('removes an uploaded object when the patient file metadata insert fails', async () => {
  const client = clientWithAuth();
  const calls = [];
  client.storage = { from: () => ({
    upload: async path => { calls.push({ operation: 'upload', path }); return { data: { path }, error: null }; },
    remove: async paths => { calls.push({ operation: 'remove', paths }); return { data: paths, error: null }; },
  }) };
  client.from = () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error('duplicate metadata') }) }) }) });
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  await assert.rejects(() => store.uploadPatientFile('clinic-id', { databaseId: 'patient-id' }, {
    file: { type: 'image/png', size: 32 }, title: 'Consentimiento', kind: 'consent', signedAt: '',
  }), /No se pudo guardar la referencia del archivo\./);
  assert.equal(calls[0].operation, 'upload');
  assert.deepEqual(calls[1], { operation: 'remove', paths: [calls[0].path] });
});

test('removes an uploaded object and stops when the current user is missing', async () => {
  let uploadedPath;
  let removed;
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    storage: { from: () => ({
      upload: async path => { uploadedPath = path; return { data: { path }, error: null }; },
      remove: async paths => { removed = paths; return { data: paths, error: null }; },
    }) },
  };
  let metadataWrites = 0;
  client.from = () => { metadataWrites++; throw new Error('Metadata must not be written without a user.'); };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  await assert.rejects(() => store.uploadPatientFile('clinic-id', { databaseId: 'patient-id' }, {
    file: { type: 'image/jpeg', size: 32 }, title: 'Consentimiento', kind: 'consent', signedAt: '',
  }), /No se pudo validar la sesión actual\./);
  assert.deepEqual(removed, [uploadedPath]);
  assert.equal(metadataWrites, 0);
});
