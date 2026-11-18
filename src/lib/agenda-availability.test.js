import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaFreeBlocks, agendaWorkingHours, defaultAgendaHours } from './agenda-availability.js';

const date = '2026-11-18';
const provider = { id: 'provider', name: 'Professional' };
const branchId = 'branch';
const makeHours = row => ({ provider_id: provider.id, branch_id: branchId, ...row });

test('date exceptions take priority over weekly hours and a closed day has no fallback', () => {
  const weekly = makeHours({ day_of_week: 3, opens_minute: 600, closes_minute: 720 });
  const closed = makeHours({ on_date: date, closed: true });
  assert.deepEqual(agendaWorkingHours([weekly], date, provider.id, branchId), {
    windows: [{ start: 600, end: 720 }], assumed: false,
  });
  assert.deepEqual(agendaWorkingHours([weekly, closed], date, provider.id, branchId), { windows: [], assumed: false });
  assert.deepEqual(agendaWorkingHours([weekly], date, provider.id, 'other'), { windows: [defaultAgendaHours], assumed: true });
});

test('availability respects other branches’ bookings and scoped closures, rounds to bookable starts, and applies duration', () => {
  const appointment = {
    date, providerId: provider.id, time: '10:00', duration: '30 min', branchId: 'other', status: 'Por confirmar',
  };
  const block = (scope, from, to, ids = {}) => ({
    scope, starts_at: `${date}T${from}:00-08:00`, ends_at: `${date}T${to}:00-08:00`, ...ids,
  });
  const input = {
    date, timeZone: 'America/Tijuana', provider, branchId,
    windows: [{ start: 540, end: 720 }],
    appointments: [appointment, { ...appointment, time: '09:00', status: 'Cancelada' }],
    blocks: [
      block('provider', '09:15', '09:30', { provider_id: 'other' }),
      block('branch', '09:00', '10:00', { branch_id: 'other' }),
      block('branch', '10:45', '11:07', { branch_id: branchId }),
      block('provider', '11:15', '11:30', { provider_id: provider.id }),
      block('clinic', '11:45', '12:00'),
    ],
  };
  assert.deepEqual(agendaFreeBlocks({ ...input, duration: 15 }), [
    { start: 540, end: 600 }, { start: 630, end: 645 }, { start: 690, end: 705 },
  ]);
  assert.deepEqual(agendaFreeBlocks({ ...input, duration: 30 }), [{ start: 540, end: 600 }]);
});
