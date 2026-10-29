import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentAgendaColor, filterAgendaAppointments, sortAgendaAppointments } from './agenda-colors.js';

const providers = [{ id: 'gladys', branchSettings: { florezen: { color: 'orange' }, elixir: { color: 'yellow' } } }, { id: 'iliana', branchSettings: { elixir: { color: 'red', serviceColors: { morpheus: 'pink', nctf: 'pink', revision: 'red' } } } }];
test('agenda color depends on professional and branch, independently of patient tone', () => {
  assert.equal(appointmentAgendaColor({ providerId: 'gladys', branchId: 'florezen', tone: 'blue' }, providers), 'orange');
  assert.equal(appointmentAgendaColor({ providerId: 'gladys', branchId: 'elixir', tone: 'blue' }, providers), 'yellow');
  assert.equal(appointmentAgendaColor({ providerId: 'gladys', branchId: 'other' }, providers), 'unassigned');
});
test('procedure rules handle accents and case, prioritize reviews, and match complete words', () => {
  const color = service => appointmentAgendaColor({ providerId: 'iliana', branchId: 'elixir', service }, providers);
  assert.equal(color('MORPHEUS facial'), 'pink');
  assert.equal(color('Aplicación de NCTF'), 'pink');
  assert.equal(color('Revisión de Morpheus'), 'red');
  assert.equal(color('Revisiones de Morpheus'), 'red');
  assert.equal(color('Morpheus8 facial'), 'pink');
  assert.equal(color('NoMorpheus'), 'red');
});
test('provider and color selections combine across views, and search is accent-insensitive', () => {
  const appointments = [{ providerId: 'gladys', agendaColor: 'orange', patient: 'María', service: 'Revisión' }, { providerId: 'iliana', agendaColor: 'pink', patient: 'Ana', service: 'Morpheus' }];
  assert.equal(filterAgendaAppointments(appointments, { providerIds: ['gladys','iliana'], colors: ['orange','pink'] }).length, 2);
  assert.equal(filterAgendaAppointments(appointments, { providerIds: ['gladys'], colors: ['pink'] }).length, 0);
  assert.equal(filterAgendaAppointments(appointments, { query: 'maria' }).length, 1);
});
test('list sorting orders dates before times across multiple days', () => {
  const rows = [{ date:'2026-11-02', time:'08:00', patient:'Ana' }, { date:'2026-11-01', time:'12:00', patient:'Zoe' }];
  assert.equal(sortAgendaAppointments(rows)[0].patient, 'Zoe');
  assert.equal(sortAgendaAppointments(rows,'patient')[0].patient, 'Ana');
  assert.equal(rows[0].patient, 'Ana');
});

test('my appointments uses the linked account identity and returns nothing for an unlinked account', () => {
  const rows = [{ providerId:'iliana', clinician:'Shared name', agendaColor:'red' }, { providerId:'other', clinician:'Shared name', agendaColor:'pink' }];
  assert.deepEqual(filterAgendaAppointments(rows,{onlyMine:true,currentProviderId:'iliana'}),[rows[0]]);
  assert.deepEqual(filterAgendaAppointments(rows,{onlyMine:true,currentProviderId:''}),[]);
  assert.deepEqual(filterAgendaAppointments(rows,{onlyMine:true,currentProviderId:'iliana',colors:['pink']}),[]);
  assert.equal(filterAgendaAppointments(rows,{onlyMine:false,currentProviderId:''}).length,2);
});
