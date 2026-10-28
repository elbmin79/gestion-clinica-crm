import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { actionFromWhatsAppMessage, confirmationMessages, confirmationReplyForMessage, validWhatsAppSignature } from './whatsapp-confirmation.js';

test('checks Meta webhook signatures against the exact raw body', () => {
  const body = '{"object":"whatsapp_business_account"}';
  const secret = 'test-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(validWhatsAppSignature(body, signature, secret), true);
  assert.equal(validWhatsAppSignature(`${body} `, signature, secret), false);
  assert.equal(validWhatsAppSignature(body, signature, 'wrong-secret'), false);
  assert.equal(validWhatsAppSignature(body, '', secret), false);
});

test('maps only explicit appointment replies and extracts inbound messages', () => {
  assert.equal(actionFromWhatsAppMessage({ interactive: { button_reply: { id: 'confirm' } } }), 'confirm');
  assert.equal(actionFromWhatsAppMessage({ button: { payload: 'cancel' } }), 'cancel');
  assert.equal(actionFromWhatsAppMessage({ text: { body: 'Reagendar' } }), 'reschedule');
  assert.equal(actionFromWhatsAppMessage({ text: { body: 'Sí, confirmo.' } }), 'confirm');
  assert.equal(actionFromWhatsAppMessage({ text: { body: 'Necesito reagendar, por favor' } }), 'reschedule');
  assert.equal(actionFromWhatsAppMessage({ text: { body: 'Hola, buenos días' } }), '');
  assert.equal(confirmationMessages({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1' }] } }] }] }).length, 1);
});

test('keeps recognized WhatsApp replies even when they have no reply-thread context', () => {
  assert.deepEqual(confirmationReplyForMessage({ id: 'wamid.2', from: '5215550102030', text: { body: 'Reagendar' } }), {
    contextMessageId: null,
    inboundMessageId: 'wamid.2',
    from: '5215550102030',
    action: 'reschedule',
  });
  assert.equal(confirmationReplyForMessage({ from: '5215550102030', text: { body: 'Confirmar' } }), null);
  assert.equal(confirmationReplyForMessage({ id: 'wamid.3', from: '5215550102030', text: { body: 'Hola' } }), null);
});
