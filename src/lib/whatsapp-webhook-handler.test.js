import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWhatsAppWebhookHandlers } from './whatsapp-webhook-handler.js';

const env = { WHATSAPP_APP_SECRET: 'webhook-test-secret', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-test-token' };

function signedRequest(body, secret = env.WHATSAPP_APP_SECRET) {
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return new Request('http://localhost/api/webhooks/whatsapp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body,
  });
}

test('verifies WhatsApp webhook subscriptions only with the configured token', async () => {
  const handlers = createWhatsAppWebhookHandlers({ createServiceClient: () => null, env });
  const good = await handlers.GET(new Request('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-test-token&hub.challenge=challenge-42'));
  assert.equal(good.status, 200);
  assert.equal(await good.text(), 'challenge-42');
  const bad = await handlers.GET(new Request('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-42'));
  assert.equal(bad.status, 403);
});

test('forwards a signed reschedule reply without context to the database for safe phone matching', async () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.reschedule', from: '5215550102030', text: { body: 'Reagendar' } }] } }] }] });
  const calls = [];
  const handlers = createWhatsAppWebhookHandlers({
    env,
    createServiceClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: 'staff_follow_up', error: null }; } }),
  });
  const response = await handlers.POST(signedRequest(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: 1, processed: 1 });
  assert.deepEqual(calls, [{
    name: 'apply_appointment_confirmation_reply',
    args: { target_context_message_id: null, target_inbound_message_id: 'wamid.reschedule', target_from: '5215550102030', target_action: 'reschedule' },
  }]);
});

test('rejects unsigned webhook requests without constructing the service client', async () => {
  let created = false;
  const handlers = createWhatsAppWebhookHandlers({ env, createServiceClient: () => { created = true; return null; } });
  const response = await handlers.POST(new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 401);
  assert.equal(created, false);
});
