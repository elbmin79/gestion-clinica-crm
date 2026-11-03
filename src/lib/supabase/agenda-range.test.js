import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaQueryRange, createClinicAgendaStore } from './clinic-agenda.js';

test('list queries include the final selected day in the clinic timezone', () => {
  const range = agendaQueryRange('2026-10-29','Lista','America/Tijuana','2026-10-30');
  assert.equal(range.from, '2026-10-29T07:00:00.000Z');
  assert.equal(range.to, '2026-10-31T07:00:00.000Z');
});
test('invalid list end falls back to one day and DST ranges use local midnight', () => {
  assert.deepEqual(agendaQueryRange('2026-10-29','Lista','America/Tijuana','2026-10-28'), agendaQueryRange('2026-10-29','Día','America/Tijuana'));
  const range = agendaQueryRange('2026-11-01','Lista','America/Tijuana','2026-11-01');
  assert.equal(new Date(range.to)-new Date(range.from),25*60*60*1000);
});

test('week, month, and year views query complete clinic-local ranges', () => {
  const clinicDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const week = agendaQueryRange('2026-10-29', 'Semana', 'America/Tijuana');
  const month = agendaQueryRange('2026-10-29', 'Mes', 'America/Tijuana');
  const year = agendaQueryRange('2026-10-29', 'Año', 'America/Tijuana');
  assert.deepEqual([clinicDay(week.from), clinicDay(week.to)], ['2026-10-26', '2026-11-02']);
  assert.deepEqual([clinicDay(month.from), clinicDay(month.to)], ['2026-10-01', '2026-11-01']);
  assert.deepEqual([clinicDay(year.from), clinicDay(year.to)], ['2026-01-01', '2027-01-01']);
});

test('long agenda ranges page past the database row limit and fail instead of returning a partial result', async () => {
  const calls = [];
  const row = { id:'appointment', starts_at:'2026-10-29T16:00:00Z', ends_at:'2026-10-29T16:45:00Z' };
  let failSecond = false;
  const builder = {
    select() { return this; }, eq() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; },
    async range(from,to) { calls.push([from,to]); return from === 0 ? { data: Array.from({length:500},(_,index)=>({...row,id:`first-${index}`})) } : failSecond ? { error:{code:'unavailable'} } : { data:[{...row,id:'last'}] }; },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({ from: () => builder }) });
  const catalogs = { patients:[],branches:[],providers:[],businesses:[] };
  const rows = await store.load('clinic','2026-10-29','Lista','America/Tijuana',catalogs,'2026-10-30');
  assert.equal(rows.length,501);
  assert.equal(rows.at(-1).id,'last');
  assert.deepEqual(calls,[[0,499],[500,999]]);
  failSecond=true;
  await assert.rejects(store.load('clinic','2026-10-29','Lista','America/Tijuana',catalogs,'2026-10-30'), /No se pudo cargar la agenda/);
});

test('appointment edits persist location, professional, service snapshot, schedule, modality, and status together', async () => {
  let updated;
  const builder = {
    update(row) { updated = row; return this; }, eq() { return this; }, select() { return this; },
    async single() { return { data: { id: 'appointment-id' }, error: null }; },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({ from: table => { assert.equal(table, 'appointments'); return builder; } }) });
  const result = await store.update('clinic-id', { id: 'appointment-id' }, {
    businessId: 'business-new', branchId: 'branch-new', providerId: 'provider-new',
    date: '2026-11-04', time: '13:15', durationMinutes: 60,
    service: 'Consulta nueva', serviceId: 'service-new', serviceIds: ['service-new'],
    serviceSnapshot: { code: 'CONSULTA', name: 'Consulta nueva' }, modality: 'Virtual', status: 'Confirmada',
  }, 'America/Tijuana');
  assert.deepEqual(result, { id: 'appointment-id' });
  assert.deepEqual(updated, {
    business_id: 'business-new', branch_id: 'branch-new', provider_id: 'provider-new',
    starts_at: '2026-11-04T21:15:00.000Z', ends_at: '2026-11-04T22:15:00.000Z',
    service: 'Consulta nueva', service_id: 'service-new', service_ids: ['service-new'],
    service_snapshot: { code: 'CONSULTA', name: 'Consulta nueva' }, modality: 'virtual', status: 'confirmed',
  });
});
