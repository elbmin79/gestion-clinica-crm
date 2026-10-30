import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmationDispatchHandler } from './appointment-confirmation-dispatch.js';

const env = {
  REMINDER_DISPATCH_SECRET: 'dispatch-test-secret',
  NODE_ENV: 'test',
  // Legacy provider values must never activate live sending.
  WHATSAPP_CLOUD_API_VERSION: 'v99.0',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_ACCESS_TOKEN: 'not-a-real-token',
};
const route = { ok: true, sender: { sender_key: 'mock:east', display_label: 'Sucursal Este' }, route: 'branch' };

function request(token = env.REMINDER_DISPATCH_SECRET) {
  return new Request('http://localhost/api/confirmations/dispatch', {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
}
function cronRequest(token = 'cron-test-secret') {
  return new Request('http://localhost/api/confirmations/dispatch', {
    method: 'GET', headers: { authorization: `Bearer ${token}` },
  });
}

function fakeClient({ eligible = true, settle = { data: true, error: null } } = {}) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_due_appointment_confirmations') return { data: [{ request_id: 'request-1' }], error: null };
      if (name === 'get_claimed_appointment_confirmation_v2') return {
        data: eligible ? [{ request_id: 'request-1', clinic_id: 'clinic-1', branch_id: 'branch-1', phone: '+525550102030', patient_name: 'María Ficticia', appointment_at: '2026-11-01T20:00:00.000Z' }] : [],
        error: null,
      };
      if (name === 'settle_appointment_confirmation') return settle;
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  return { client, calls };
}

test('requires the scheduler bearer secret and fails closed in production', async () => {
  let clientCreated = false;
  const createServiceClient = () => { clientCreated = true; return null; };
  const handler = createConfirmationDispatchHandler({ createServiceClient, env });
  assert.equal((await handler(request('wrong'))).status, 401);
  assert.equal(clientCreated, false);
  const production = createConfirmationDispatchHandler({ createServiceClient, env: { ...env, NODE_ENV: 'production' } });
  assert.equal((await production(request())).status, 503);
  assert.equal(clientCreated, false);
});

test('fails closed for Twilio confirmations until automated delivery is explicitly enabled', async () => {
  let clientCreated = false;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => { clientCreated = true; return null; },
    env: { ...env, WHATSAPP_PROVIDER_MODE: 'twilio', TWILIO_WHATSAPP_ENABLED: 'true', WHATSAPP_AUTOMATION_ENABLED: 'false' },
    createProvider: () => ({ mode: 'twilio', available: true, simulated: false }),
  });
  assert.equal((await handler(request())).status, 503);
  assert.equal(clientCreated, false);
});

test('Vercel cron accepts CRON_SECRET and leaves the confirmation queue untouched while delivery is disabled', async () => {
  let clientCreated = false;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => { clientCreated = true; throw new Error('The disabled cron must not claim queue items.'); },
    env: { ...env, CRON_SECRET: 'cron-test-secret', WHATSAPP_PROVIDER_MODE: 'twilio', TWILIO_WHATSAPP_ENABLED: 'true', WHATSAPP_AUTOMATION_ENABLED: 'false' },
  });
  const response = await handler(cronRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 0, skipped: true, mode: 'twilio', simulated: false, counts: { claimed: 0, sent: 0, failed: 0, unknown: 0, skipped: 0 } });
  assert.equal(clientCreated, false);
  assert.equal((await handler(cronRequest('wrong'))).status, 401);
});

test('dispatches a configured Twilio confirmation as a real provider result when enabled', async () => {
  const { client, calls } = fakeClient();
  let payload;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env: { ...env, CRON_SECRET: 'cron-test-secret', WHATSAPP_PROVIDER_MODE: 'twilio', TWILIO_WHATSAPP_ENABLED: 'true', WHATSAPP_AUTOMATION_ENABLED: 'true' },
    loadRoute: async () => ({ ok: true, sender: { sender_key: 'twilio:+14155550123' }, route: 'branch' }),
    createProvider: () => ({ mode: 'twilio', available: true, simulated: false, sendTemplate: async input => {
      payload = input;
      return { status: 'accepted', messageId: `SM${'2'.repeat(32)}`, error: null, simulated: false };
    } }),
  });
  const response = await handler(cronRequest());
  assert.deepEqual(await response.json(), { processed: 1, mode: 'twilio', simulated: false, counts: { claimed: 1, sent: 1, failed: 0, unknown: 0, skipped: 0 } });
  assert.equal(payload.sender.sender_key, 'twilio:+14155550123');
  assert.equal(calls.at(-1).args.target_message_id, `SM${'2'.repeat(32)}`);
  assert.equal(calls.at(-1).args.target_error, null);
});

test('uses a branch-mapped mock provider and records an accepted synthetic result', async () => {
  const { client, calls } = fakeClient();
  let sendCount = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env,
    loadRoute: async (_client, clinicId, branchId, kind) => {
      assert.deepEqual([clinicId, branchId, kind], ['clinic-1', 'branch-1', 'confirmation_2d']);
      return route;
    },
    createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async payload => {
      sendCount++;
      assert.equal(payload.sender.sender_key, 'mock:east');
      assert.equal(payload.recipient, '+525550102030');
      return { status: 'accepted', messageId: 'mock:synthetic-1', error: null };
    } }),
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 1, mode: 'mock', simulated: true, counts: { claimed: 1, sent: 1, failed: 0, unknown: 0, skipped: 0 } });
  assert.equal(sendCount, 1);
  assert.deepEqual(calls.at(-1), { name: 'settle_appointment_confirmation', args: {
    target_request_id: 'request-1', target_status: 'sent', target_message_id: 'mock:synthetic-1', target_error: null,
  } });
});

test('records failed and uncertain provider outcomes without retrying', async () => {
  for (const [status, countKey] of [['failed', 'failed'], ['unknown', 'unknown']]) {
    const { client, calls } = fakeClient();
    let sends = 0;
    const handler = createConfirmationDispatchHandler({
      createServiceClient: () => client,
      env,
      loadRoute: async () => route,
      createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => {
        sends++;
        return { status, messageId: null, error: `Resultado simulado: ${status}` };
      } }),
    });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).counts[countKey], 1);
    assert.equal(sends, 1);
    assert.equal(calls.at(-1).args.target_status, status);
    assert.match(calls.at(-1).args.target_error, /^Resultado simulado:/);
  }
});

test('skips an ineligible appointment without calling the provider', async () => {
  const { client, calls } = fakeClient({ eligible: false });
  let sends = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env,
    createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => { sends++; } }),
  });
  const response = await handler(request());
  assert.equal((await response.json()).counts.skipped, 1);
  assert.equal(sends, 0);
  assert.equal(calls.at(-1).args.target_status, 'skipped');
});

test('refuses to dispatch when no clinic sender route is configured', async () => {
  const { client, calls } = fakeClient();
  let sends = 0;
  const handler = createConfirmationDispatchHandler({
    createServiceClient: () => client,
    env,
    loadRoute: async () => ({ ok: false, reason: 'No sender mapping.' }),
    createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => { sends++; } }),
  });
  const response = await handler(request());
  assert.equal((await response.json()).counts.failed, 1);
  assert.equal(sends, 0);
  assert.equal(calls.at(-1).args.target_status, 'failed');
});
