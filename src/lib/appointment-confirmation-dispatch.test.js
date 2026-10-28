import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmationDispatchHandler } from './appointment-confirmation-dispatch.js';

const configuredEnv = {
  REMINDER_DISPATCH_SECRET: 'dispatch-test-secret',
  WHATSAPP_TEMPLATE_CONFIRMATION_2D: 'confirmation_two_days',
  WHATSAPP_CLOUD_API_VERSION: 'v99.0',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_ACCESS_TOKEN: 'fake-token',
  WHATSAPP_TEMPLATE_LANGUAGE: 'es_MX',
  CLINIC_TIME_ZONE: 'America/Tijuana',
};

function request(token = 'dispatch-test-secret') {
  return new Request('http://localhost/api/confirmations/dispatch', {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
}

function fakeClient({ eligible = true, settle = { data: true, error: null } } = {}) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_due_appointment_confirmations') return { data: [{ request_id: 'request-1' }], error: null };
      if (name === 'get_claimed_appointment_confirmation') return {
        data: eligible ? [{ request_id: 'request-1', phone: '+525550102030', patient_name: 'María Ficticia', appointment_at: '2026-11-01T20:00:00.000Z' }] : [],
        error: null,
      };
      if (name === 'settle_appointment_confirmation') return settle;
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  return { client, calls };
}

test('refuses dispatch without a valid bearer secret or complete WhatsApp configuration', async () => {
  let clientCreated = false;
  const createServiceClient = () => { clientCreated = true; return null; };
  const unauthorized = createConfirmationDispatchHandler({ createServiceClient, env: configuredEnv });
  assert.equal((await unauthorized(request('wrong-secret'))).status, 401);
  assert.equal(clientCreated, false);

  const incomplete = createConfirmationDispatchHandler({ createServiceClient, env: { ...configuredEnv, WHATSAPP_ACCESS_TOKEN: '' } });
  assert.equal((await incomplete(request())).status, 503);
  assert.equal(clientCreated, false);
});

test('sends the approved template payload and settles a successful confirmation', async () => {
  const { client, calls } = fakeClient();
  let sentRequest;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env: configuredEnv,
    fetchImpl: async (url, init) => {
      sentRequest = { url, init };
      return Response.json({ messages: [{ id: 'wamid.test-success' }] });
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 1, counts: { claimed: 1, sent: 1, failed: 0, unknown: 0, skipped: 0 } });
  assert.equal(sentRequest.url, 'https://graph.facebook.com/v99.0/123456789/messages');
  const body = JSON.parse(sentRequest.init.body);
  assert.equal(body.template.name, 'confirmation_two_days');
  assert.equal(body.template.components[0].parameters[0].text, 'María');
  assert.deepEqual(body.template.components.slice(1).map(button => button.parameters[0].payload), ['confirm', 'cancel', 'reschedule']);
  assert.deepEqual(calls.at(-1), {
    name: 'settle_appointment_confirmation',
    args: { target_request_id: 'request-1', target_status: 'sent', target_message_id: 'wamid.test-success', target_error: null },
  });
});

test('skips a claimed appointment that fails the second eligibility check without contacting WhatsApp', async () => {
  const { client, calls } = fakeClient({ eligible: false });
  let sendCount = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env: configuredEnv,
    fetchImpl: async () => { sendCount++; throw new Error('The provider must not be called.'); },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).counts, { claimed: 1, sent: 0, failed: 0, unknown: 0, skipped: 1 });
  assert.equal(sendCount, 0);
  assert.deepEqual(calls.at(-1).args, {
    target_request_id: 'request-1', target_status: 'skipped', target_error: 'Appointment is no longer eligible for confirmation.',
  });
});

test('reports an uncertain claim when a skipped status cannot be saved', async () => {
  const { client } = fakeClient({ eligible: false, settle: { data: false, error: null } });
  let sendCount = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env: configuredEnv,
    fetchImpl: async () => { sendCount++; throw new Error('The provider must not be called.'); },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).counts, { claimed: 1, sent: 0, failed: 0, unknown: 1, skipped: 0 });
  assert.equal(sendCount, 0);
});

test('records a provider rejection as failed rather than retrying a non-retriable response', async () => {
  const { client, calls } = fakeClient();
  let sendCount = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env: configuredEnv,
    fetchImpl: async () => { sendCount++; return Response.json({ error: 'template rejected' }, { status: 400 }); },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(sendCount, 1);
  assert.deepEqual((await response.json()).counts, { claimed: 1, sent: 0, failed: 1, unknown: 0, skipped: 0 });
  assert.equal(calls.at(-1).args.target_status, 'failed');
});
