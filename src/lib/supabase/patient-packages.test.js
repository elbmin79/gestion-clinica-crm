import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatientPackageStore } from './patient-packages.js';

test('lists clinic package balances with patient identifiers and available session counts', async () => {
  const calls = [];
  const row = {
    id: 'package-id', patient_id: 'patient-id', service_id: 'service-id', service_name: 'Limpieza facial',
    sessions_total: 6, agreed_amount: '6000.00', created_at: '2026-10-01T00:00:00.000Z',
    completed_sessions: 2, reserved_sessions: 1, paid_amount: '3000.00',
  };
  const query = {
    select: (columns, options) => { calls.push({ select: columns, options }); return query; },
    eq: (column, value) => { calls.push({ eq: [column, value] }); return query; },
    order: (column, options) => { calls.push({ order: [column, options] }); return query; },
    range: async (from, to) => { calls.push({ range: [from, to] }); return { data: [row], count: 1, error: null }; },
  };
  const client = { from: table => { assert.equal(table, 'patient_package_balances'); return query; } };
  const store = createPatientPackageStore({ clientFactory: () => client });
  const packages = await store.listForClinic('clinic-id');
  assert.equal(packages[0].patientId, 'patient-id');
  assert.equal(packages[0].availableSessions, 3);
  assert.equal(packages[0].outstandingAmount, 3000);
  assert.ok(calls.some(call => call.eq?.[0] === 'clinic_id' && call.eq[1] === 'clinic-id'));
  assert.match(calls[0].select, /patient_id/);
});
