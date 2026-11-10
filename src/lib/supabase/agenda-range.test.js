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

test('appointment edits persist notes and other details without clearing notes on unrelated updates', async () => {
  let updated;
  const builder = {
    update(row) { updated = row; return this; }, eq() { return this; }, select() { return this; },
    async single() { return { data: { id: 'appointment-id' }, error: null }; },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({ from: table => { assert.equal(table, 'appointments'); return builder; } }) });
  const appointment = { id: 'appointment-id' };
  const input = {
    businessId: 'business-new', branchId: 'branch-new', providerId: 'provider-new',
    date: '2026-11-04', time: '13:15', durationMinutes: 60,
    service: 'Consulta nueva', serviceId: 'service-new', serviceIds: ['service-new'],
    serviceSnapshot: { code: 'CONSULTA', name: 'Consulta nueva' }, modality: 'Virtual', status: 'Confirmada',
  };
  const result = await store.update('clinic-id', appointment, { ...input, note: '  Prefiere horario de tarde.  ' }, 'America/Tijuana');
  assert.deepEqual(result, { id: 'appointment-id' });
  assert.deepEqual(updated, {
    business_id: 'business-new', branch_id: 'branch-new', provider_id: 'provider-new',
    starts_at: '2026-11-04T21:15:00.000Z', ends_at: '2026-11-04T22:15:00.000Z',
    service: 'Consulta nueva', service_id: 'service-new', service_ids: ['service-new'],
    service_snapshot: { code: 'CONSULTA', name: 'Consulta nueva' }, modality: 'virtual', status: 'confirmed',
    note: 'Prefiere horario de tarde.',
  });
  await store.update('clinic-id', appointment, { ...input, note: ' ' }, 'America/Tijuana');
  assert.equal(updated.note, null);
  await store.update('clinic-id', appointment, input, 'America/Tijuana');
  assert.equal(Object.hasOwn(updated, 'note'), false);
});

test('appointment prices are saved independently from deposits and remain optional for older callers', async () => {
  const writes = [];
  const builder = {
    insert(row) { writes.push(row); return this; },
    update(row) { writes.push(row); return this; },
    eq() { return this; },
    select() { return this; },
    async single() { return { data: { id: 'appointment' } }; },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({ from: () => builder }) });
  const input = {
    patient: { databaseId: 'patient' }, service: 'Consulta', note: '',
    date: '2026-11-04', time: '13:15', durationMinutes: 30,
    depositRequired: true, depositAmount: 100,
  };
  const zone = 'America/Tijuana';
  await store.create('clinic', { ...input, sessionPrice: { amount: 50, currency: 'USD' } }, zone);
  await store.create('clinic', input, zone);
  await store.update('clinic', { id: 'appointment' }, { ...input, sessionPrice: null }, zone);
  await store.update('clinic', { id: 'appointment' }, input, zone);
  assert.deepEqual([writes[0].deposit_amount, writes[0].session_price_amount, writes[0].session_price_currency], [100, 50, 'USD']);
  assert.equal(Object.hasOwn(writes[1], 'session_price_amount'), false);
  assert.deepEqual([writes[2].session_price_amount, writes[2].session_price_currency], [null, null]);
  assert.equal(Object.hasOwn(writes[3], 'session_price_amount'), false);
});

test('agenda loads pricing and arrival, with a fallback for older shared databases', async () => {
  const row = { id: 'appointment', starts_at: '2026-11-04T21:15:00.000Z', ends_at: '2026-11-04T21:45:00.000Z' };
  const columns = [];
  let migrated = true;
  const builder = {
    select(value) { columns.push(value); return this; },
    eq() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; },
    async range() {
      if (migrated) return { data: [{ ...row, session_price_amount: '0', session_price_currency: 'MXN', arrived_at: '2026-11-04T21:00:00Z' }] };
      if (columns.at(-1).includes('session_price_amount')) return { error: { code: '42703', message: 'column appointments.session_price_amount does not exist' } };
      if (columns.at(-1).includes('arrived_at')) return { error: { code: '42703', message: 'column appointments.arrived_at does not exist' } };
      return { data: [row] };
    },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({ from: () => builder }) });
  const load = () => store.load('clinic', '2026-11-04', 'Día', 'America/Tijuana', { patients: [], branches: [], providers: [], businesses: [] });
  const [withPrice] = await load();
  assert.deepEqual(withPrice.sessionPrice, { amount: 0, currency: 'MXN' });
  assert.equal(withPrice.arrivedAt, '2026-11-04T21:00:00Z');
  migrated = false;
  const [legacy] = await load();
  assert.equal(legacy.sessionPrice, null);
  assert.equal(legacy.arrivedAt, null);
  assert.equal(columns.length, 4);
  assert.equal(columns.at(-1).includes('session_price_amount'), false);
});

test('arrival uses the server timestamp and surfaces an unavailable check-in migration', async () => {
  let result = { data: '2026-11-04T21:00:00Z' };
  const store = createClinicAgendaStore({ clientFactory: () => ({
    async rpc(name, args) {
      assert.equal(name, 'record_appointment_arrival');
      assert.deepEqual(args, { target_clinic_id: 'clinic', target_appointment_id: 'appointment' });
      return result;
    },
  }) });
  assert.equal(await store.recordArrival('clinic', 'appointment'), result.data);
  result = { error: { code: 'PGRST202' } };
  await assert.rejects(store.recordArrival('clinic', 'appointment'), /Actualiza la base compartida/);
});

test('completed history is patient and clinic scoped, ignores the agenda date range and reads every page', async () => {
  const filters = [];
  const requests = [];
  const visit = { id: 'appt', service: 'Consulta', service_ids: ['service'], ends_at: '2026-08-01T16:00:00Z' };
  const builder = {
    select(columns, options) { requests.push(options); return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    lte(key, value) { assert.equal(key, 'ends_at'); assert.ok(Number.isFinite(Date.parse(value))); return this; },
    order(key) { assert.equal(key, 'id'); return this; },
    async range(from, to) {
      assert.equal(to, from + 499);
      return from === 0 ? { count: 501, data: Array.from({ length: 500 }, () => visit) } : { data: [visit] };
    },
  };
  const store = createClinicAgendaStore({ clientFactory: () => ({
    from(table) { assert.equal(table, 'appointments'); return builder; },
  }) });
  const result = await store.loadCompletedHistory('clinic', 'patient');
  assert.equal(result.length, 501);
  assert.deepEqual(result[0].serviceIds, ['service']);
  assert.deepEqual(filters, Array.from({ length: 2 }, () => [['clinic_id', 'clinic'], ['patient_id', 'patient'], ['status', 'completed']]).flat());
  assert.deepEqual(requests, [{ count: 'exact' }, undefined]);
});
