import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCompletedVisits, summarizeAppointmentHistory } from './appointment-history.js';

const timeZone = 'America/Tijuana';
const now = Date.parse('2026-11-09T21:00:00Z');

test('history counts completed visits across branches and follows the appointment cutoff', () => {
  const visit = { patientId: 'p1', status: 'Completada', service: 'VALORACION', date: '2026-11-09', time: '11:00', duration: '30 min' };
  const rows = demoCompletedVisits([
    { ...visit, branchId: 'other' },
    { ...visit, time: '14:00' },
    { ...visit, patientId: 'p2' },
    { ...visit, status: 'Cancelada' },
    { ...visit, status: 'Confirmada' },
    { ...visit, date: '' },
  ], 'p1', timeZone);
  const treatments = [{ name: 'Valoración' }];
  assert.equal(summarizeAppointmentHistory(rows, treatments, { date: '2026-11-09', time: '11:15', timeZone, now }).completedVisits, 0);
  const result = summarizeAppointmentHistory(rows, treatments, { date: '2026-11-10', time: '11:00', timeZone, now });
  assert.equal(result.completedVisits, 1);
  assert.equal(result.treatments[0].sessions, 1);
});

test('catalog identity survives renames, supports multi-service visits and recognizes older manual visits', () => {
  const endsAt = '2026-11-08T16:00:00Z';
  const rows = [
    { service: 'Old name', serviceIds: ['facial', 'review'], endsAt },
    { service: 'VALORACION', endsAt },
    { service: 'Valoración', serviceId: 'other-valuation', endsAt },
    { service: 'Mesoject + Dermapen + Facial', serviceSnapshot: { services: [{ name: 'Mesoject + Dermapen' }, { name: 'Facial' }] }, endsAt },
  ];
  const treatments = [{ id: 'facial', name: 'Facial' }, { id: 'review', name: 'Valoración' }, { name: 'Mesoject + Dermapen' }];
  const result = summarizeAppointmentHistory(rows, treatments, { timeZone, now });
  assert.equal(result.completedVisits, 4);
  assert.deepEqual(result.treatments.map(treatment => treatment.sessions), [2, 2, 1]);
});
