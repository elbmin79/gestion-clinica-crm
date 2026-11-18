import test from 'node:test';
import assert from 'node:assert/strict';
import { compactAgendaColors, packAgendaAppointments } from './agenda-compact.js';

test('compact agenda packs overlaps and lets a new group reuse full width', () => {
  const appointments = [
    { id: 'long', time: '09:00', duration: '60 min' },
    { id: 'first', time: '09:00', duration: '15 min' },
    { id: 'second', time: '09:15', duration: '30 min' },
    { id: 'third', time: '09:30', duration: '15 min' },
    { id: 'later', time: '10:00', duration: '15 min' },
  ];
  const events = packAgendaAppointments(appointments, 360, 1440);
  assert.deepEqual(events.map(event => [event.appointment.id, event.column, event.columnCount]), [
    ['long', 0, 3], ['first', 1, 3], ['second', 1, 3], ['third', 2, 3], ['later', 0, 1],
  ]);
  assert.equal(events[1].span, 2);
  assert.equal(events[2].span, 1);
});

test('each professional gets a distinct color independent of catalog order', () => {
  const providers = Array.from({ length: 12 }, (_, id) => ({ id: String(id), name: `Professional ${id}` }));
  const colors = compactAgendaColors(providers);
  assert.deepEqual(colors, compactAgendaColors([...providers].reverse()));
  assert.equal(new Set(colors.map(color => color.hex)).size, providers.length);
});
