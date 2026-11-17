import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatientDirectoryStore } from './patient-directory.js';

function clientWithAuth() {
  return { auth: { getUser: async () => ({ data: { user: { id: 'user-id' } }, error: null }) } };
}

test('creates a patient without a primary professional when none is provided', async () => {
  const client = clientWithAuth();
  let inserted;
  client.from = table => {
    assert.equal(table, 'patients');
    return { insert: row => {
      inserted = row;
      return { select: () => ({ single: async () => ({ data: { id: 'patient-id', record_number: 'PAC-123' }, error: null }) }) };
    } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  await store.create('clinic-id', {
    name: 'Andrea García', email: '', phone: '', treatment: 'Por definir', branchId: 'branch-id',
  });
  assert.equal(inserted.primary_branch_id, 'branch-id');
  assert.equal(inserted.primary_provider_id, null);
  assert.equal('first_visit' in inserted, false);
  await store.create('clinic-id', {
    name: 'Paciente de prueba', email: '', phone: '', treatment: '', firstVisit: true,
  });
  assert.equal(inserted.first_visit, true);
});

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
    vitals: {}, physical_exam: {}, prognosis: '', evolution: '',
  });
});

test('creates a general aesthetic procedure with mapped zones and clinician metadata', async () => {
  const client = clientWithAuth();
  let inserted;
  client.from = table => {
    assert.equal(table, 'patient_procedure_records');
    return { insert: row => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: 'procedure-id' }, error: null }) }) }; } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const zones = [{ name: 'Entrecejo', dose: '8 U' }, { name: 'Frente', dose: '12 U' }];
  const result = await store.createProcedure('clinic-id', { databaseId: 'patient-id', providerId: 'provider-id' }, {
    appointmentId: 'appointment-id', performedAt: '2026-11-16T20:00:00.000Z', procedureType: 'Toxina botulínica',
    product: 'Product B', lotNumber: 'LOT-88', zones, followUp: 'Control en 14 días', consentDocumentId: 'consent-id',
  });
  assert.deepEqual(result, { id: 'procedure-id' });
  assert.deepEqual(inserted, {
    clinic_id: 'clinic-id', patient_id: 'patient-id', appointment_id: 'appointment-id', clinician_id: 'provider-id',
    performed_at: '2026-11-16T20:00:00.000Z', procedure_type: 'Toxina botulínica', product: 'Product B',
    lot_number: 'LOT-88', zones, follow_up: 'Control en 14 días', consent_document_id: 'consent-id', created_by: 'user-id',
  });
});

test('saves explicit clinical history states without converting unanswered fields to denial', async () => {
  const client = clientWithAuth();
  let inserted;
  let options;
  client.from = table => {
    assert.equal(table, 'patient_clinical_histories');
    return { upsert: (row, upsertOptions) => { inserted = row; options = upsertOptions; return { select: () => ({ single: async () => ({ data: { id: 'history-id', updated_at: '2026-11-16T20:00:00.000Z' }, error: null }) }) }; } };
  };
  const answers = { allergies: { state: 'not_asked', detail: '' }, surgeries: { state: 'denies', detail: 'Patient denies prior surgery' } };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const saved = await store.saveClinicalHistory('clinic-id', { databaseId: 'patient-id' }, answers);
  assert.equal(saved.id, 'history-id');
  assert.equal(inserted.answers.allergies.state, 'not_asked');
  assert.equal(inserted.answers.surgeries.state, 'denies');
  assert.deepEqual(options, { onConflict: 'clinic_id,patient_id' });
});

test('prepares an image-use consent and preserves an explicit refusal', async () => {
  const client = clientWithAuth();
  let rpcName;
  let rpcArgs;
  client.rpc = (name, args) => {
    rpcName = name;
    rpcArgs = args;
    return Promise.resolve({ data: [{
      document_id: 'document-id', document_title: 'Consentimiento de uso de imagen', document_kind: 'consent',
      document_template_version: 1, document_content_snapshot: 'Texto de prueba', document_status: 'pending',
      document_requested_at: '2026-11-16T20:00:00.000Z', document_image_use_authorized: false,
    }], error: null });
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const prepared = await store.createPatientDocument('clinic-id', { databaseId: 'patient-id' }, {
    kind: 'consent', template: { id: 'template-id', title: 'Consentimiento de uso de imagen' }, imageUseAuthorized: false,
  });
  assert.equal(rpcName, 'prepare_patient_document');
  assert.equal(rpcArgs.target_image_use_authorized, false);
  assert.equal(prepared.imageUseAuthorized, false);
  assert.equal(prepared.id, 'document-id');
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

test('uploads an aesthetic before-and-after photo as a private clinical file', async () => {
  const client = clientWithAuth();
  let inserted;
  client.storage = { from: () => ({
    upload: async path => ({ data: { path }, error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.test/signed' }, error: null }),
    remove: async () => ({ data: [], error: null }),
  }) };
  client.from = table => {
    assert.equal(table, 'patient_document_files');
    return { insert: row => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) }; } };
  };
  const store = createPatientDirectoryStore({ clientFactory: () => client });
  const saved = await store.uploadPatientFile('clinic-id', { databaseId: 'patient-id' }, {
    file: { type: 'image/jpeg', size: 1024 }, title: 'Antes / después', kind: 'clinical_photo', signedAt: '',
  });
  assert.equal(saved.kind, 'clinical_photo');
  assert.equal(inserted.kind, 'clinical_photo');
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
