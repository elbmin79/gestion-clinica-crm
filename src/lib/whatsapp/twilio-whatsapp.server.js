import { Buffer } from 'node:buffer';

const e164Pattern = /^\+[1-9]\d{7,14}$/;
const contentSidPattern = /^HX[0-9a-fA-F]{32}$/;

function normalizedApprovalStatus(record) {
  const approval = record?.approvals?.whatsapp
    || record?.whatsapp
    || record?.approval_requests?.whatsapp
    || record?.approval_content?.channel;
  if (!approval) return 'draft';
  const status = String(approval?.status || '').toLowerCase();
  return ['received', 'pending', 'approved', 'rejected', 'paused', 'disabled'].includes(status) ? status : 'unavailable';
}

async function postTwilioContent(path, body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) throw new Error('WhatsApp templates are not configured.');
  const response = await fetchImpl(`https://content.twilio.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* Use the generic error below. */ }
  if (!response.ok) throw new Error('Twilio rejected the WhatsApp template request.');
  return payload;
}

export async function createTwilioWhatsAppTemplate({ name, body, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const friendlyName = String(name || '').trim();
  const editorBody = String(body || '').trim();
  const hasDate = /(?<!\{)\{fecha\}(?!\})/i.test(editorBody);
  const hasTime = /(?<!\{)\{hora\}(?!\})/i.test(editorBody);
  const messageBody = editorBody
    .replace(/(?<!\{)\{fecha\}(?!\})/gi, '{{1}}')
    .replace(/(?<!\{)\{hora\}(?!\})/gi, '{{2}}');
  if (friendlyName.length < 3 || friendlyName.length > 60) throw new Error('El nombre debe tener entre 3 y 60 caracteres.');
  if (messageBody.length < 10 || messageBody.length > 1024 || !hasDate || !hasTime || /\{\{(?:fecha|hora)\}\}/i.test(editorBody)) {
    throw new Error('El mensaje debe incluir {fecha} y {hora} para la cita.');
  }
  const payload = await postTwilioContent('Content', {
    friendly_name: friendlyName,
    language: 'es_MX',
    variables: { '1': '15 de noviembre', '2': '3:30 p. m.' },
    types: { 'twilio/text': { body: messageBody } },
  }, { env, fetchImpl });
  if (!/^HX[0-9a-fA-F]{32}$/.test(String(payload?.sid || ''))) throw new Error('Twilio no devolvió el identificador de la plantilla.');
  return { sid: payload.sid, name: friendlyName, language: 'es_MX', status: 'draft' };
}

export async function submitTwilioWhatsAppTemplateApproval({ sid, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!/^HX[0-9a-fA-F]{32}$/.test(String(sid || ''))) throw new Error('La plantilla seleccionada no es válida.');
  const payload = await postTwilioContent(`Content/${sid}/ApprovalRequests/WhatsApp`, {
    name: `recordatorio_cita_${String(sid).slice(-8).toLowerCase()}`,
    category: 'UTILITY',
  }, { env, fetchImpl });
  return { sid, status: String(payload?.status || 'pending').toLowerCase() };
}

export async function listTwilioWhatsAppTemplates({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const credentialsAvailable = /^AC[0-9a-fA-F]{32}$/.test(accountSid) && Boolean(authToken);
  if (!credentialsAvailable) throw new Error('WhatsApp template lookup is not configured.');
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const records = [];
  let pageUrl = new URL('https://content.twilio.com/v1/ContentAndApprovals');
  pageUrl.search = new URLSearchParams({ PageSize: '100' }).toString();
  let pageCount = 0;
  while (pageUrl) {
    if (pageCount++ >= 100 || pageUrl.origin !== 'https://content.twilio.com' || pageUrl.pathname !== '/v1/ContentAndApprovals') {
      throw new Error('WhatsApp template lookup returned an invalid page.');
    }
    const response = await fetchImpl(pageUrl, {
      method: 'GET',
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('WhatsApp template lookup failed.');
    const payload = await response.json();
    if (Array.isArray(payload?.contents)) records.push(...payload.contents);
    const nextPage = payload?.meta?.next_page_url;
    pageUrl = typeof nextPage === 'string' && nextPage ? new URL(nextPage, pageUrl) : null;
  }
  return records.filter(record => contentSidPattern.test(String(record?.sid || ''))).map(record => {
    const status = normalizedApprovalStatus(record);
    const name = record.friendly_name || record.whatsapp?.name || record.types && Object.keys(record.types)[0] || record.sid;
    return { sid: String(record.sid), name: String(name).slice(0, 120), language: String(record.language || '').slice(0, 10), status };
  });
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
      return credentialsAvailable;
    },
    async sendTemplate({ sender, recipient, templateKind, contentSid, context = {} } = {}) {
      const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
      const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
      const senderAddress = String(sender?.sender_key || '').replace(/^twilio:/, '').trim();
      const rawRecipient = String(recipient || '').trim();
      const to = rawRecipient.startsWith('whatsapp:') ? rawRecipient : `whatsapp:${rawRecipient}`;

      if (!credentialsAvailable) {
        return { status: 'failed', messageId: null, error: 'Faltan las credenciales del servicio de WhatsApp.', simulated: false };
      }
      if (!/^\+[1-9]\d{7,14}$/.test(senderAddress) || !/^\+[1-9]\d{7,14}$/.test(to.replace(/^whatsapp:/, ''))) {
        return { status: 'failed', messageId: null, error: 'El remitente o destinatario no tiene un formato internacional válido.', simulated: false };
      }
      if (!contentSid || !contentSidPattern.test(contentSid)) {
        return { status: 'failed', messageId: null, error: 'Selecciona una plantilla aprobada para este aviso.', simulated: false };
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
