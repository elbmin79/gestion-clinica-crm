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
