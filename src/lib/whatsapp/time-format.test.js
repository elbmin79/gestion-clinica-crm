import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppTimeline, formatWhatsAppDayLabel, formatWhatsAppMessageTime, formatWhatsAppThreadTime } from './time-format.js';

test('message timestamps contain only the local time', () => {
  const value = new Date(2026, 9, 30, 17, 12);
  const formatted = formatWhatsAppMessageTime(value);
  assert.match(formatted, /5:12/);
  assert.doesNotMatch(formatted, /2026|30\/10/);
});

test('day dividers label today and yesterday, then show a date', () => {
  const now = new Date(2026, 9, 30, 15);
  assert.equal(formatWhatsAppDayLabel(new Date(2026, 9, 30, 9), now), 'Hoy');
  assert.equal(formatWhatsAppDayLabel(new Date(2026, 9, 29, 9), now), 'Ayer');
  assert.match(formatWhatsAppDayLabel(new Date(2026, 9, 27, 9), now), /27 de octubre/);
  assert.match(formatWhatsAppDayLabel(new Date(2025, 9, 27, 9), now), /2025/);
});

test('timeline inserts one centered day label at each local date boundary', () => {
  const timeline = buildWhatsAppTimeline([
    { id: 'one', created_at: '2026-10-29T18:00:00Z' },
    { id: 'two', created_at: '2026-10-29T19:00:00Z' },
    { id: 'three', created_at: '2026-10-30T18:00:00Z' },
  ], new Date(2026, 9, 30, 15));
  assert.deepEqual(timeline.filter(item => item.type === 'day').map(item => item.label), ['Ayer', 'Hoy']);
  assert.deepEqual(timeline.filter(item => item.type === 'message').map(item => item.key), ['one', 'two', 'three']);
});

test('conversation list uses compact WhatsApp-style relative dates', () => {
  const now = new Date(2026, 9, 30, 15);
  assert.match(formatWhatsAppThreadTime(new Date(2026, 9, 30, 12, 5), now), /12:05/);
  assert.equal(formatWhatsAppThreadTime(new Date(2026, 9, 29, 12), now), 'Ayer');
  assert.match(formatWhatsAppThreadTime(new Date(2026, 9, 20, 12), now), /20\/10\/26/);
});
