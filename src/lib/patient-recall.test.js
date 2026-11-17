import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPatientRecallQueue } from './patient-recall.js';

const now = new Date('2026-11-16T20:00:00.000Z');
const patient = { id: 'PAC-1', databaseId: 'patient-1', name: 'Paciente de prueba', treatment: 'Tratamiento facial', status: 'Activo' };

test('recalls packages with unbooked sessions even when the patient has another future visit', () => {
  const queue = buildPatientRecallQueue([patient], [
    { patientId: patient.id, date: '2026-11-20', status: 'Por confirmar', service: 'Consulta de valoración' },
  ], [{ id: 'package-1', patientId: patient.databaseId, serviceId: 'service-1', serviceName: 'Limpieza facial', availableSessions: 2 }], 'America/Tijuana', now);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'package');
  assert.equal(queue[0].package.id, 'package-1');
  assert.match(queue[0].reason, /2 sesiones disponibles/);
});

test('does not recall package sessions already reserved in a future appointment', () => {
  const queue = buildPatientRecallQueue([patient], [
    { patientId: patient.id, packageId: 'package-1', date: '2026-11-20', status: 'Confirmada' },
  ], [{ id: 'package-1', patientId: patient.databaseId, serviceName: 'Limpieza facial', availableSessions: 1 }], 'America/Tijuana', now);
  assert.equal(queue.some(item => item.kind === 'package'), false);
});

test('recalls overdue aesthetic visits and patients explicitly marked for follow-up', () => {
  const overdue = { ...patient, status: 'Activo' };
  const followUp = { ...patient, id: 'PAC-2', databaseId: 'patient-2', status: 'Seguimiento' };
  const queue = buildPatientRecallQueue([overdue, followUp], [
    { patientId: overdue.id, date: '2026-10-10', status: 'Completada', service: 'Limpieza facial' },
  ], [], 'America/Tijuana', now);
  assert.equal(queue.length, 2);
  assert.equal(queue.find(item => item.patient.id === overdue.id).daysSince, 37);
  assert.equal(queue.find(item => item.patient.id === followUp.id).reason, 'Seguimiento pendiente');
});
