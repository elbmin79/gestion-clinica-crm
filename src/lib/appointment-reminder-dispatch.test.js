import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderDispatchHandler } from './appointment-reminder-dispatch.js';

const env = { REMINDER_DISPATCH_SECRET: 'dispatch-test-secret', NODE_ENV: 'test', WHATSAPP_ACCESS_TOKEN: 'legacy-value' };
const testRoute = { ok: true, sender: { sender_key: 'mock:branch-one', display_label: 'Sucursal Uno' }, route: 'branch' };
function request(token = env.REMINDER_DISPATCH_SECRET) {
  return new Request('http://localhost/api/reminders/dispatch', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
}
function fakeClient({ eligible = true, settled = true } = {}) {
  const calls = [];
  return {
    calls,
    client: { async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_due_appointment_reminders') return { data: [{ reminder_id: 'reminder-1' }], error: null };
      if (name === 'get_claimed_reminder_for_dispatch_v2') return { data: eligible ? [{ clinic_id: 'clinic-1', branch_id: 'branch-1', kind: 'reminder_1d', phone: '+525550102030', patient_name: 'Paciente de prueba', appointment_at: '2026-11-01T20:00:00Z' }] : [], error: null };
      if (name === 'settle_appointment_reminder') return { data: settled, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    } },
  };
}

test('requires scheduler authorization and disables production even when old Meta variables exist', async () => {
  let created = false;
  const createServiceClient = () => { created = true; return null; };
  const handler = createReminderDispatchHandler({ createServiceClient, env });
  assert.equal((await handler(request('no'))).status, 401);
  const production = createReminderDispatchHandler({ createServiceClient, env: { ...env, NODE_ENV: 'production' } });
  assert.equal((await production(request())).status, 503);
  assert.equal(created, false);
});

test('dispatches and records accepted, failed, and uncertain mock outcomes without network calls', async () => {
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Dispatch must not access network.'); };
  try {
    for (const [resultStatus, expectedCount, databaseStatus] of [
      ['accepted', 'sent', 'sent'], ['failed', 'failed', 'failed'], ['unknown', 'unknown', 'unknown'],
    ]) {
      const { client, calls } = fakeClient();
      let sends = 0;
      const handler = createReminderDispatchHandler({
        createServiceClient: () => client,
        env,
        loadRoute: async () => testRoute,
        createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async payload => {
          sends++;
          assert.equal(payload.sender.sender_key, 'mock:branch-one');
          assert.equal(payload.recipient, '+525550102030');
          return { status: resultStatus, messageId: resultStatus === 'accepted' ? 'mock:accepted-1' : null, error: resultStatus === 'accepted' ? null : `Resultado simulado: ${resultStatus}` };
        } }),
      });
      const response = await handler(request());
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.simulated, true);
      assert.equal(body.counts[expectedCount], 1);
      assert.equal(sends, 1);
      assert.equal(calls.at(-1).args.target_status, databaseStatus);
      if (resultStatus === 'accepted') assert.equal(calls.at(-1).args.target_provider_message_id, 'mock:accepted-1');
      else assert.match(calls.at(-1).args.target_error, /^Resultado simulado:/);
    }
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('skips ineligible appointments and fails closed when clinic routing is missing', async () => {
  const ineligible = fakeClient({ eligible: false });
  let sends = 0;
  let handler = createReminderDispatchHandler({ createServiceClient: () => ineligible.client, env, createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => { sends++; } }) });
  assert.equal((await (await handler(request())).json()).counts.skipped, 1);
  assert.equal(sends, 0);

  const missingRoute = fakeClient();
  handler = createReminderDispatchHandler({
    createServiceClient: () => missingRoute.client,
    env,
    loadRoute: async () => ({ ok: false, reason: 'No sender mapping.' }),
    createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => { sends++; } }),
  });
  assert.equal((await (await handler(request())).json()).counts.failed, 1);
  assert.equal(sends, 0);
  assert.equal(missingRoute.calls.at(-1).args.target_error, 'No sender mapping.');
});

test('reports unknown if the outcome cannot be persisted, preventing a blind retry', async () => {
  const { client } = fakeClient({ settled: false });
  const handler = createReminderDispatchHandler({
    createServiceClient: () => client,
    env,
    loadRoute: async () => testRoute,
    createProvider: () => ({ mode: 'mock', available: true, sendTemplate: async () => ({ status: 'accepted', messageId: 'mock:once', error: null }) }),
  });
  assert.equal((await (await handler(request())).json()).counts.unknown, 1);
});
