import test from 'node:test';
import assert from 'node:assert/strict';
import twilio from 'twilio';
import { createTwilioWhatsAppWebhookHandler } from './twilio-whatsapp-webhook.js';

const accountSid = `AC${'a'.repeat(32)}`;
const authToken = 'webhook-test-auth-token';
const publicUrl = 'https://gestion-clinica-crm.vercel.app/api/webhooks/twilio/whatsapp';
const env = { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_WEBHOOK_PUBLIC_BASE_URL: 'https://gestion-clinica-crm.vercel.app' };

function makeRequest({ overrides = {}, signatureOverrides = {} } = {}) {
  const params = {
    AccountSid: accountSid,
    MessageSid: `SM${'b'.repeat(32)}`,
    From: 'whatsapp:+15551234567',
    To: 'whatsapp:+14155238886',
    Body: 'Sí, confirmo',
    ...overrides,
  };
  const body = new URLSearchParams(params).toString();
  const signature = twilio.getExpectedTwilioSignature(authToken, publicUrl, { ...params, ...signatureOverrides });
  return new Request('http://localhost:3000/api/webhooks/twilio/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body,
  });
}

test('validates Twilio signature and routes appointment replies to the clinic confirmation handler', async () => {
  const calls = [];
  const client = {
    from: table => ({
      upsert: (values, options) => { calls.push({ table, values, options }); return { select: () => ({ single: async () => ({ data: { id: 'conversation-1' }, error: null }) }) }; },
    }),
    rpc: async (name, args) => { calls.push({ name, args }); return { data: 'confirmed', error: null }; },
  };
  const handler = createTwilioWhatsAppWebhookHandler({
    env,
    createServiceClient: () => client,
    resolveSender: async (_client, phone) => phone === '+14155238886' ? { clinicId: 'clinic-1', branchId: 'branch-1' } : null,
  });
  const response = await handler(makeRequest({ overrides: { OriginalRepliedMessageSid: `SM${'c'.repeat(32)}` } }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<Response\/>/);
  assert.equal(calls[0].table, 'clinic_whatsapp_conversations');
  assert.equal(calls[0].values.contact_phone, '+15551234567');
  assert.equal(calls[0].values.sender_phone, '+14155238886');
  assert.equal(calls[1].table, 'clinic_whatsapp_messages');
  assert.equal(calls[1].values.direction, 'inbound');
  assert.deepEqual(calls[2], {
      name: 'apply_appointment_confirmation_reply_v2',
      args: {
      target_clinic_id: 'clinic-1',
      target_branch_id: 'branch-1',
      target_context_message_id: `SM${'c'.repeat(32)}`,
      target_inbound_message_id: `SM${'b'.repeat(32)}`,
      target_from: '+15551234567',
      target_action: 'confirm',
      },
  });
});

test('rejects invalid signatures and mismatched Twilio accounts before processing', async () => {
  let clientCreated = false;
  const handler = createTwilioWhatsAppWebhookHandler({
    env,
    createServiceClient: () => { clientCreated = true; return null; },
  });
  const invalid = new Request('http://localhost:3000/api/webhooks/twilio/whatsapp', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalid' },
    body: new URLSearchParams({ AccountSid: accountSid }).toString(),
  });
  assert.equal((await handler(invalid)).status, 401);
  assert.equal((await handler(makeRequest({ overrides: { AccountSid: `AC${'d'.repeat(32)}` } }))).status, 403);
  assert.equal(clientCreated, false);
});

test('stores ordinary inbound messages even when they are not appointment replies', async () => {
  const saved = [];
  const handler = createTwilioWhatsAppWebhookHandler({
    env,
    createServiceClient: () => ({
      from: table => ({
        upsert: values => { saved.push({ table, values }); return table === 'clinic_whatsapp_conversations'
          ? { select: () => ({ single: async () => ({ data: { id: 'conversation-2' }, error: null }) }) }
          : Promise.resolve({ error: null }); },
      }),
      rpc: async () => { throw new Error('ordinary messages should not trigger confirmation handling'); },
    }),
    resolveSender: async () => ({ clinicId: 'clinic-1' }),
  });
  const response = await handler(makeRequest({ overrides: { Body: 'Hola, necesito ayuda' } }));
  assert.equal(response.status, 200);
  assert.equal(saved[1].values.body, 'Hola, necesito ayuda');
  assert.equal(saved[1].values.direction, 'inbound');
});

test('requires a configured public HTTPS webhook URL and signed form submissions', async () => {
  const handler = createTwilioWhatsAppWebhookHandler({ env: { ...env, TWILIO_WEBHOOK_PUBLIC_BASE_URL: '' }, createServiceClient: () => null });
  assert.equal((await handler(makeRequest())).status, 503);
  const badContentType = new Request('http://localhost:3000/api/webhooks/twilio/whatsapp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-twilio-signature': 'signature' }, body: '{}',
  });
  assert.equal((await createTwilioWhatsAppWebhookHandler({ env })(badContentType)).status, 415);
});
