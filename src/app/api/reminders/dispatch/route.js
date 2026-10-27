import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CLAIM = 3;

function isAuthorized(request, expectedSecret) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(authorization)) return false;
  const supplied = authorization.replace(/^Bearer\s+/i, '');
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expectedSecret);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function templateFor(kind) {
  const names = {
    confirmation_2d: process.env.WHATSAPP_TEMPLATE_CONFIRMATION_2D,
    reminder_1d: process.env.WHATSAPP_TEMPLATE_REMINDER_1D,
    reminder_5h: process.env.WHATSAPP_TEMPLATE_REMINDER_5H,
  };
  return names[kind]?.trim() || '';
}

function appointmentLabel(isoDate) {
  const timeZone = process.env.CLINIC_TIME_ZONE?.trim() || 'America/Tijuana';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(isoDate));
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Paciente';
}

function templatePayload(reminder) {
  const templateName = templateFor(reminder.kind);
  if (!templateName) throw new Error(`No approved WhatsApp template is configured for ${reminder.kind}.`);

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: reminder.phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'es_MX' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: firstName(reminder.patient_name) },
          { type: 'text', text: appointmentLabel(reminder.appointment_at) },
        ],
      }],
    },
  };
}

async function sendTemplate(reminder, config) {
  const endpoint = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const body = JSON.stringify(templatePayload(reminder));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
      cache: 'no-store',
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* classify below without logging provider content */ }

    if (!response.ok) {
      const code = payload?.error?.code;
      const result = {
        status: response.status >= 500 ? 'unknown' : 'failed',
        messageId: null,
        error: `WhatsApp API returned HTTP ${response.status}${code ? ` (code ${code})` : ''}.`,
      };
      return result;
    }

    const messageId = payload?.messages?.[0]?.id;
    if (!messageId) {
      return { status: 'unknown', messageId: null, error: 'WhatsApp API accepted the request without returning a message ID.' };
    }
    return { status: 'sent', messageId, error: null };
  } catch (error) {
    // The request may have reached Meta before a timeout or connection loss.
    // Keep it out of automatic retries to avoid sending duplicates.
    return { status: 'unknown', messageId: null, error: error?.name === 'AbortError' ? 'WhatsApp request timed out; delivery is uncertain.' : 'WhatsApp connection failed; delivery is uncertain.' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  const dispatchSecret = process.env.REMINDER_DISPATCH_SECRET?.trim();
  if (!dispatchSecret) return Response.json({ error: 'Reminder delivery is not configured.' }, { status: 503 });
  if (!isAuthorized(request, dispatchSecret)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
  if (!/^v\d+\.\d+$/.test(apiVersion) || !/^\d+$/.test(phoneNumberId) || !accessToken) {
    return Response.json({ error: 'WhatsApp Cloud API configuration is incomplete.' }, { status: 503 });
  }
  if (!['WHATSAPP_TEMPLATE_CONFIRMATION_2D', 'WHATSAPP_TEMPLATE_REMINDER_1D', 'WHATSAPP_TEMPLATE_REMINDER_5H'].every(name => process.env[name]?.trim()) || !process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim()) {
    return Response.json({ error: 'Approved WhatsApp template configuration is incomplete.' }, { status: 503 });
  }

  const client = createServiceClient();
  if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });

  const { data: claimed, error: claimError } = await client.rpc('claim_due_appointment_reminders', { target_limit: MAX_CLAIM });
  if (claimError) {
    return Response.json({ error: 'Could not claim due appointment reminders.' }, { status: 503 });
  }

  const counts = { claimed: (claimed || []).length, sent: 0, failed: 0, unknown: 0, skipped: 0 };
  for (const reminder of claimed || []) {
    // Consent, appointment status, schedule generation, and E.164 phone are
    // checked again after claiming and immediately before the provider call.
    const { data: dispatchable, error: checkError } = await client.rpc('get_claimed_reminder_for_dispatch', {
      target_reminder_id: reminder.reminder_id,
    });

    if (checkError) {
      const { data: settled, error: settleError } = await client.rpc('settle_appointment_reminder', {
        target_reminder_id: reminder.reminder_id,
        target_status: 'failed',
        target_error: 'Could not recheck consent and appointment eligibility; no provider request was made.',
      });
      if (settleError || settled !== true) counts.unknown += 1;
      else counts.failed += 1;
      continue;
    }

    if (!dispatchable?.length) {
      counts.skipped += 1;
      continue;
    }

    let result;
    try {
      result = await sendTemplate(dispatchable[0], { apiVersion, phoneNumberId, accessToken });
    } catch (error) {
      // Configuration/template-format errors occur before fetch; they cannot
      // have delivered a message and can be corrected before retrying.
      result = { status: 'failed', messageId: null, error: String(error?.message || 'Message template configuration is invalid.').slice(0, 300) };
    }

    const { data: settled, error: settleError } = await client.rpc('settle_appointment_reminder', {
      target_reminder_id: reminder.reminder_id,
      target_status: result.status,
      target_provider_message_id: result.messageId,
      target_error: result.error,
    });
    const outcome = settleError || settled !== true ? 'unknown' : result.status;
    counts[outcome] += 1;
  }

  return Response.json({ processed: counts.claimed, counts }, { headers: { 'Cache-Control': 'no-store' } });
}
