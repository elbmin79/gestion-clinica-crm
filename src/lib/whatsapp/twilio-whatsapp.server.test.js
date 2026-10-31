import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwilioWhatsAppProvider, listRegisteredTwilioWhatsAppSenders } from './twilio-whatsapp.server.js';

const env = {
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'auth-secret',
  CLINIC_TIME_ZONE: 'America/Tijuana',
};

test('lists only online, account-registered WhatsApp sender numbers', async () => {
  let request;
  const senders = await listRegisteredTwilioWhatsAppSenders({
    env,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({ senders: [
        { sid: `XE${'a'.repeat(32)}`, status: 'ONLINE', sender_id: 'whatsapp:+15017122661', friendly_name: 'Clinic Main' },
        { sid: `XE${'b'.repeat(32)}`, status: 'PENDING_VERIFICATION', sender_id: 'whatsapp:+15017122662' },
        { sid: `XE${'c'.repeat(32)}`, status: 'ONLINE', sender_id: 'whatsapp:not-a-number' },
      ] });
    },
  });

  assert.deepEqual(senders, [{ phoneNumber: '+15017122661', displayLabel: 'Clinic Main', senderSid: `XE${'a'.repeat(32)}` }]);
  assert.equal(String(request.url), 'https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=1000&Page=0');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.Authorization, `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`);
});
test('follows Twilio sender-list pagination without forwarding credentials to another host', async () => {
  const requestedUrls = [];
  let requestCount = 0;
  const senders = await listRegisteredTwilioWhatsAppSenders({
    env,
    fetchImpl: async (url, init) => {
      requestedUrls.push({ url: String(url), authorization: init.headers.Authorization });
      requestCount++;
      return requestCount === 1
        ? Response.json({ senders: [], meta: { next_page_url: 'https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=1000&Page=1&PageToken=next' } })
        : Response.json({ senders: [{ sid: `XE${'f'.repeat(32)}`, status: 'ONLINE', sender_id: 'whatsapp:+15017122663' }], meta: { next_page_url: null } });
    },
  });
  assert.equal(requestCount, 2);
  assert.match(requestedUrls[1].url, /PageToken=next/);
  assert.equal(requestedUrls[0].authorization, requestedUrls[1].authorization);
  assert.deepEqual(senders.map(sender => sender.phoneNumber), ['+15017122663']);

  await assert.rejects(listRegisteredTwilioWhatsAppSenders({
    env,
    fetchImpl: async () => Response.json({ senders: [], meta: { next_page_url: 'https://attacker.example/collect' } }),
  }), /invalid page URL/);
});

test('requires account credentials before listing sender numbers', async () => {
  await assert.rejects(listRegisteredTwilioWhatsAppSenders({ env: {}, fetchImpl: async () => { throw new Error('must not call'); } }), /not configured/);
});

test('sends appointment messages from a configured, approved WhatsApp sender and template', async () => {
  let request;
  const provider = createTwilioWhatsAppProvider({
    env: {
      ...env,
      TWILIO_WHATSAPP_ENABLED: 'true',
      TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D: `HX${'d'.repeat(32)}`,
    },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({ sid: `SM${'e'.repeat(32)}`, status: 'queued' }, { status: 201 });
    },
  });

  const result = await provider.sendTemplate({
    sender: { sender_key: 'twilio:+15017122661' },
    recipient: '+15551234567',
    templateKind: 'reminder_1d',
    contentSid: `HX${'d'.repeat(32)}`,
    context: { appointmentAt: '2026-10-30T20:00:00.000Z' },
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.simulated, false);
  assert.equal(request.url, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
  const form = new URLSearchParams(request.init.body);
  assert.equal(form.get('From'), 'whatsapp:+15017122661');
  assert.equal(form.get('To'), 'whatsapp:+15551234567');
  assert.equal(form.get('ContentSid'), `HX${'d'.repeat(32)}`);
});

test('fails closed when live sending is disabled, credentials are missing, or a template SID is absent', async () => {
  let calls = 0;
  const disabled = createTwilioWhatsAppProvider({ env, fetchImpl: async () => { calls++; } });
  assert.equal((await disabled.sendTemplate({ sender: { sender_key: 'twilio:+15017122661' }, recipient: '+15551234567', templateKind: 'reminder_1d', contentSid: `HX${'d'.repeat(32)}` })).status, 'failed');

  const missingCredentials = createTwilioWhatsAppProvider({ env: { TWILIO_WHATSAPP_ENABLED: 'true' }, fetchImpl: async () => { calls++; } });
  assert.equal((await missingCredentials.sendTemplate({ sender: { sender_key: 'twilio:+15017122661' }, recipient: '+15551234567', templateKind: 'reminder_1d', contentSid: `HX${'d'.repeat(32)}` })).status, 'failed');

  const missingTemplate = createTwilioWhatsAppProvider({ env: { ...env, TWILIO_WHATSAPP_ENABLED: 'true' }, fetchImpl: async () => { calls++; } });
  assert.equal((await missingTemplate.sendTemplate({ sender: { sender_key: 'twilio:+15017122661' }, recipient: '+15551234567', templateKind: 'reminder_1d' })).status, 'failed');
  assert.equal(calls, 0);
});

test('reports failed responses and uncertain network outcomes without exposing credentials', async () => {
  const network = createTwilioWhatsAppProvider({
      env: { ...env, TWILIO_WHATSAPP_ENABLED: 'true', TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D: `HX${'d'.repeat(32)}` },
    fetchImpl: async () => { throw new Error('private network details'); },
  });
  const unknown = await network.sendTemplate({ sender: { sender_key: 'twilio:+15017122661' }, recipient: '+15551234567', templateKind: 'reminder_1d', contentSid: `HX${'d'.repeat(32)}` });
  assert.equal(unknown.status, 'unknown');
  assert.doesNotMatch(unknown.error, /private network details|auth-secret/);

  const rejected = createTwilioWhatsAppProvider({
      env: { ...env, TWILIO_WHATSAPP_ENABLED: 'true', TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D: `HX${'d'.repeat(32)}` },
    fetchImpl: async () => Response.json({ code: 63015, message: 'private details' }, { status: 400 }),
  });
  const failed = await rejected.sendTemplate({ sender: { sender_key: 'twilio:+15017122661' }, recipient: '+15551234567', templateKind: 'reminder_1d', contentSid: `HX${'d'.repeat(32)}` });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /63015/);
  assert.doesNotMatch(failed.error, /private details|auth-secret/);
});
