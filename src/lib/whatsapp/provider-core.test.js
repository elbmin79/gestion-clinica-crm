import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDisabledWhatsAppProvider,
  createMockWhatsAppProvider,
  resolveMockSender,
  resolveWhatsAppProviderMode,
  templateReadyForKind,
} from './provider-core.js';

test('defaults to mock only outside production and disables live modes', () => {
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'development' }), 'mock');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'test' }), 'mock');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'development', WHATSAPP_PROVIDER_MODE: 'cloud' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production', WHATSAPP_PROVIDER_MODE: 'mock' }), 'mock');
});

test('routes to the exact branch sender and only uses explicit default fallback', () => {
  const settings = { provider_mode: 'mock', allow_default_fallback: false };
  const senders = [
    { sender_key: 'mock:default', is_default: true, branch_id: null },
    { sender_key: 'mock:east', branch_id: 'branch-east' },
    { sender_key: 'mock:inactive', branch_id: 'branch-west', active: false },
  ];
  assert.equal(resolveMockSender(settings, senders, 'branch-east').sender.sender_key, 'mock:east');
  assert.equal(resolveMockSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveMockSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveMockSender({ ...settings, allow_default_fallback: true }, senders, 'branch-west').sender.sender_key, 'mock:default');
  assert.equal(resolveMockSender({ ...settings, provider_mode: 'cloud' }, senders, 'branch-east').ok, false);
});

test('checks simulated template readiness and produces accepted, failed, and unknown outcomes without fetch', async () => {
  let networkCalls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Mock provider must not use network.'); };
  try {
    const settings = { template_readiness: { reminder_1d: true, reminder_5h: false } };
    assert.equal(templateReadyForKind(settings, 'reminder_1d'), true);
    assert.equal(templateReadyForKind(settings, 'reminder_5h'), false);
    assert.equal(templateReadyForKind(settings, 'unknown'), false);
    const sender = { sender_key: 'mock:east' };
    const accepted = await createMockWhatsAppProvider({ idFactory: () => 'id-1' }).sendTemplate({ sender, templateKind: 'reminder_1d' });
    assert.deepEqual(accepted, { status: 'accepted', messageId: 'mock:id-1', error: null, simulated: true });
    const failed = await createMockWhatsAppProvider({ outcome: 'failed' }).sendTemplate({ sender, templateKind: 'reminder_1d' });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.simulated, true);
    const unknown = await createMockWhatsAppProvider({ outcome: 'unknown' }).sendTemplate({ sender, templateKind: 'reminder_1d' });
    assert.equal(unknown.status, 'unknown');
    assert.equal(unknown.simulated, true);
    assert.equal((await createMockWhatsAppProvider().sendTemplate({ sender: { sender_key: 'live-id' }, templateKind: 'reminder_1d' })).status, 'failed');
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('disabled provider cannot send', async () => {
  const provider = createDisabledWhatsAppProvider();
  assert.equal(provider.available, false);
  assert.equal((await provider.sendTemplate({})).status, 'failed');
});
