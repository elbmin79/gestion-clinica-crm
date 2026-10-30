import { Buffer } from 'node:buffer';

const liveContentSidKeys = Object.freeze({
  confirmation_2d: 'TWILIO_WHATSAPP_CONTENT_SID_CONFIRMATION_2D',
  reminder_1d: 'TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D',
  reminder_5h: 'TWILIO_WHATSAPP_CONTENT_SID_REMINDER_5H',
});

const e164Pattern = /^\+[1-9]\d{7,14}$/;
const contentSidPattern = /^HX[0-9a-fA-F]{32}$/;

export function getConfiguredWhatsAppTemplates(env = process.env) {
  return Object.freeze(Object.fromEntries(Object.entries(liveContentSidKeys).map(([kind, key]) => [
    kind,
    contentSidPattern.test(String(env[key] || '').trim()),
  ])));
}

const templateKinds = Object.keys(liveContentSidKeys);

export async function getWhatsAppTemplateStatuses({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const credentialsAvailable = /^AC[0-9a-fA-F]{32}$/.test(accountSid) && Boolean(authToken);
  const authorization = credentialsAvailable ? Buffer.from(`${accountSid}:${authToken}`).toString('base64') : '';
  const entries = await Promise.all(Object.entries(liveContentSidKeys).map(async ([kind, key]) => {
    const contentSid = String(env[key] || '').trim();
    if (!contentSidPattern.test(contentSid)) return [kind, 'not_configured'];
    if (!credentialsAvailable) return [kind, 'unavailable'];
    try {
      const response = await fetchImpl(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
        method: 'GET',
        headers: { Authorization: `Basic ${authorization}` },
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
      if (!response.ok) return [kind, 'unavailable'];
      const payload = await response.json();
      const status = String(payload?.whatsapp?.status || '').toLowerCase();
      return [kind, ['received', 'pending', 'approved', 'rejected', 'paused', 'disabled'].includes(status) ? status : 'unavailable'];
    } catch {
      return [kind, 'unavailable'];
    }
  }));
  return Object.freeze(Object.fromEntries(entries));
}

export async function getApprovedWhatsAppTemplates(options = {}) {
  const statuses = await getWhatsAppTemplateStatuses(options);
  return Object.freeze(Object.fromEntries(templateKinds.map(kind => [kind, statuses[kind] === 'approved'])));
}

export async function listRegisteredTwilioWhatsAppSenders({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) {
    throw new Error('WhatsApp sender lookup is not configured.');
  }

  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const senderRecords = [];
  let pageUrl = new URL('https://messaging.twilio.com/v2/Channels/Senders');
  pageUrl.search = new URLSearchParams({ Channel: 'whatsapp', PageSize: '1000', Page: '0' }).toString();
  let pageCount = 0;
  while (pageUrl) {
    if (pageCount++ >= 100) throw new Error('WhatsApp sender lookup exceeded the page limit.');
    if (pageUrl.origin !== 'https://messaging.twilio.com' || pageUrl.pathname !== '/v2/Channels/Senders') {
      throw new Error('WhatsApp sender lookup returned an invalid page URL.');
    }
    const response = await fetchImpl(pageUrl, {
      method: 'GET',
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* Return a generic lookup failure below. */ }
    if (!response.ok) throw new Error('WhatsApp sender lookup failed.');
    if (Array.isArray(payload?.senders)) senderRecords.push(...payload.senders);
    const nextPage = payload?.meta?.next_page_url;
    pageUrl = typeof nextPage === 'string' && nextPage ? new URL(nextPage, pageUrl) : null;
  }

  return senderRecords
    .filter(sender => sender?.status === 'ONLINE')
    .map(sender => {
      const senderId = String(sender.sender_id || sender.senderId || '').trim();
      const phoneNumber = senderId.replace(/^whatsapp:/i, '');
      if (!e164Pattern.test(phoneNumber)) return null;
      const profileName = sender.profile?.name || sender.profile?.display_name || '';
      return {
        phoneNumber,
        displayLabel: String(sender.friendly_name || sender.friendlyName || profileName || phoneNumber).slice(0, 120),
        senderSid: String(sender.sid || ''),
      };
    })
    .filter(Boolean);
}

function contentSidForKind(env, templateKind) {
  const key = liveContentSidKeys[templateKind];
  return key ? String(env[key] || '').trim() : '';
}

function templateVariables(appointmentAt, timeZone = 'America/Tijuana') {
  const date = new Date(appointmentAt || Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid appointment date.');
  return JSON.stringify({
    '1': new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric' }).format(date),
    '2': new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date),
  });
}

export function createTwilioWhatsAppProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const credentialsAvailable = /^AC[0-9a-fA-F]{32}$/.test(String(env.TWILIO_ACCOUNT_SID || '').trim())
    && Boolean(String(env.TWILIO_AUTH_TOKEN || '').trim());

  return Object.freeze({
    mode: 'twilio',
    simulated: false,
    get available() {
      return env.TWILIO_WHATSAPP_ENABLED === 'true' && credentialsAvailable;
    },
    async sendTemplate({ sender, recipient, templateKind, context = {} } = {}) {
      const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
      const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
      const senderAddress = String(sender?.sender_key || '').replace(/^twilio:/, '').trim();
      const rawRecipient = String(recipient || '').trim();
      const to = rawRecipient.startsWith('whatsapp:') ? rawRecipient : `whatsapp:${rawRecipient}`;
      const contentSid = contentSidForKind(env, templateKind);

      if (env.TWILIO_WHATSAPP_ENABLED !== 'true' || !credentialsAvailable) {
        return { status: 'failed', messageId: null, error: 'El envío de WhatsApp con Twilio no está habilitado o faltan credenciales.', simulated: false };
      }
      if (!/^\+[1-9]\d{7,14}$/.test(senderAddress) || !/^\+[1-9]\d{7,14}$/.test(to.replace(/^whatsapp:/, ''))) {
        return { status: 'failed', messageId: null, error: 'El remitente o destinatario no tiene un formato internacional válido.', simulated: false };
      }
      if (!contentSid || !contentSidPattern.test(contentSid)) {
        return { status: 'failed', messageId: null, error: 'Falta el Content SID aprobado para esta plantilla de WhatsApp.', simulated: false };
      }

      const form = new URLSearchParams({
        To: to,
        From: `whatsapp:${senderAddress}`,
        ContentSid: contentSid,
        ContentVariables: templateVariables(context.appointmentAt, context.timeZone || env.CLINIC_TIME_ZONE || 'America/Tijuana'),
      });
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });
        let payload = {};
        try { payload = await response.json(); } catch { /* Use the generic provider error below. */ }
        if (!response.ok) {
          const code = Number.isInteger(payload?.code) ? ` (${payload.code})` : '';
          return { status: 'failed', messageId: null, error: `Twilio rechazó el mensaje${code}. Revisa el remitente y la plantilla.`, simulated: false };
        }
        const messageId = typeof payload?.sid === 'string' && /^SM[0-9a-fA-F]{32}$/.test(payload.sid) ? payload.sid : null;
        return { status: 'accepted', messageId, error: null, simulated: false };
      } catch {
        return { status: 'unknown', messageId: null, error: 'No se pudo confirmar la respuesta de Twilio; revisa sus registros antes de volver a enviar.', simulated: false };
      }
    },
  });
}
