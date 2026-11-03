import test from 'node:test';
import assert from 'node:assert/strict';
import { isWhatsAppReplyWindowOpen, WHATSAPP_REPLY_WINDOW_MS } from './reply-window.js';

test('WhatsApp reply window stays open up to but not including 24 hours', () => {
  const now = Date.parse('2026-11-02T20:00:00.000Z');
  assert.equal(isWhatsAppReplyWindowOpen(new Date(now - WHATSAPP_REPLY_WINDOW_MS + 1).toISOString(), now), true);
  assert.equal(isWhatsAppReplyWindowOpen(new Date(now - WHATSAPP_REPLY_WINDOW_MS).toISOString(), now), false);
});

test('WhatsApp reply window rejects missing, invalid, and future inbound timestamps', () => {
  const now = Date.parse('2026-11-02T20:00:00.000Z');
  assert.equal(isWhatsAppReplyWindowOpen(null, now), false);
  assert.equal(isWhatsAppReplyWindowOpen('not-a-date', now), false);
  assert.equal(isWhatsAppReplyWindowOpen(new Date(now + 1).toISOString(), now), false);
});
