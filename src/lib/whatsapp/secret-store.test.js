import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppSecretStore, whatsappSecretStore } from './secret-store.server.js';

const clinicId = '10000000-0000-0000-0000-000000000001';

test('no backing vault fails closed and returns no credential', async () => {
  assert.equal(await whatsappSecretStore.getSecret({ clinicId, name: 'cloud_access_token' }), null);
});

test('delegates only recognized clinic credential references to the server-side vault', async () => {
  const calls = [];
  const store = createWhatsAppSecretStore({ getSecret: async ref => { calls.push(ref); return 'vault-value'; } });
  assert.equal(await store.getSecret({ clinicId, name: 'cloud_access_token' }), 'vault-value');
  assert.equal(await store.getSecret({ clinicId, name: 'unknown' }), null);
  assert.equal(await store.getSecret({ clinicId: 'invalid', name: 'cloud_access_token' }), null);
  assert.deepEqual(calls, [{ clinicId, name: 'cloud_access_token' }]);
});
