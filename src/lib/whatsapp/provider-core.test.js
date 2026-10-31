import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDisabledWhatsAppProvider,
  createMockWhatsAppProvider,
  resolveMockSender,
  resolveTwilioSender,
  resolveWhatsAppProviderMode,
  templateReadyForKind,
} from './provider-core.js';

test('never falls back to mock sending unless explicitly selected', () => {
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'development' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'test' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'development', WHATSAPP_PROVIDER_MODE: 'cloud' }), 'disabled');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production', WHATSAPP_PROVIDER_MODE: 'mock' }), 'mock');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production', WHATSAPP_PROVIDER_MODE: 'twilio', TWILIO_WHATSAPP_ENABLED: 'true' }), 'twilio');
  assert.equal(resolveWhatsAppProviderMode({ NODE_ENV: 'production', WHATSAPP_PROVIDER_MODE: 'twilio', TWILIO_WHATSAPP_ENABLED: 'false' }), 'disabled');
});

test('routes Twilio sender only to its assigned branch', () => {
  const settings = { provider_mode: 'twilio', allow_default_fallback: true };
  const senders = [
    { sender_key: 'twilio:+14155550123', is_default: true, branch_id: null },
    { sender_key: 'twilio:+14155550124', branch_id: 'branch-east' },
    { sender_key: 'twilio:+14155550125', branch_id: 'branch-west', active: false },
    { sender_key: 'mock:east', branch_id: 'branch-other' },
  ];
  assert.equal(resolveTwilioSender(settings, senders, 'branch-east').sender.sender_key, 'twilio:+14155550124');
  assert.equal(resolveTwilioSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveTwilioSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveTwilioSender(settings, senders, 'branch-west').ok, false);
});

test('routes mock sender only to its assigned branch', () => {
  const settings = { provider_mode: 'mock', allow_default_fallback: true };
  const senders = [
    { sender_key: 'mock:default', is_default: true, branch_id: null },
    { sender_key: 'mock:east', branch_id: 'branch-east' },
    { sender_key: 'mock:inactive', branch_id: 'branch-west', active: false },
  ];
  assert.equal(resolveMockSender(settings, senders, 'branch-east').sender.sender_key, 'mock:east');
  assert.equal(resolveMockSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveMockSender(settings, senders, 'branch-west').ok, false);
  assert.equal(resolveMockSender(settings, senders, 'branch-west').ok, false);
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
