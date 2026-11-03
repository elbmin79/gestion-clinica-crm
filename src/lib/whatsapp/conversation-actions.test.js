import test from 'node:test';
import assert from 'node:assert/strict';
import { setConversationBlocked } from './conversation-actions.js';

function createService(result) {
  const calls = [];
  const query = {
    update(value) { calls.push(['update', value]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    select(columns) { calls.push(['select', columns]); return this; },
    async maybeSingle() { calls.push(['maybeSingle']); return result; },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

test('blocks a conversation for the exact clinic and conversation with a server timestamp', async () => {
  const service = createService({ data: { id: 'conversation-id', blocked_at: '2026-11-02T19:30:00.000Z' }, error: null });
  const result = await setConversationBlocked(service, 'clinic-id', 'conversation-id', 'block', () => '2026-11-02T19:30:00.000Z');

  assert.deepEqual(result, { blockedAt: '2026-11-02T19:30:00.000Z' });
  assert.deepEqual(service.calls, [
    ['from', 'clinic_whatsapp_conversations'],
    ['update', { blocked_at: '2026-11-02T19:30:00.000Z' }],
    ['eq', 'clinic_id', 'clinic-id'],
    ['eq', 'id', 'conversation-id'],
    ['select', 'id,blocked_at'],
    ['maybeSingle'],
  ]);
});

test('unblocks a conversation by clearing blocked_at', async () => {
  const service = createService({ data: { id: 'conversation-id', blocked_at: null }, error: null });
  const result = await setConversationBlocked(service, 'clinic-id', 'conversation-id', 'unblock');
  assert.deepEqual(result, { blockedAt: null });
  assert.deepEqual(service.calls[1], ['update', { blocked_at: null }]);
});

test('rejects unsupported actions without touching Supabase', async () => {
  const service = createService({ data: null, error: null });
  assert.deepEqual(await setConversationBlocked(service, 'clinic-id', 'conversation-id', 'delete'), { error: 'Acción inválida.', status: 400 });
  assert.deepEqual(service.calls, []);
});

test('returns not-found and database failures without reporting success', async () => {
  assert.deepEqual(await setConversationBlocked(createService({ data: null, error: null }), 'clinic-id', 'conversation-id', 'block'), { error: 'No se encontró la conversación.', status: 404 });
  assert.deepEqual(await setConversationBlocked(createService({ data: null, error: new Error('database unavailable') }), 'clinic-id', 'conversation-id', 'unblock'), { error: 'No se pudo actualizar el bloqueo de la conversación.', status: 503 });
});
