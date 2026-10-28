import { timingSafeEqual } from 'node:crypto';

const MAX_CLAIM = 10;

function authorized(request, expected) {
  const value = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(value) || !expected) return false;
  const supplied = Buffer.from(value.replace(/^Bearer\s+/i, ''));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

function payloadFor(row, templateName, env) {
  const appointmentLabel = new Intl.DateTimeFormat('es-MX', {
    timeZone: env.CLINIC_TIME_ZONE?.trim() || 'America/Tijuana',
    dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(row.appointment_at));
  const firstName = String(row.patient_name || '').trim().split(/\s+/)[0] || 'Paciente';
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: row.phone, type: 'template',
    template: {
      name: templateName, language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'es_MX' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: firstName }, { type: 'text', text: appointmentLabel }] },
        ...['confirm', 'cancel', 'reschedule'].map((payload, index) => ({
          type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }],
        })),
      ],
    },
  };
}

export function createConfirmationDispatchHandler({ createServiceClient, env = process.env, fetchImpl = fetch }) {
  return async function POST(request) {
    const secret = env.REMINDER_DISPATCH_SECRET?.trim();
    if (!secret) return Response.json({ error: 'Confirmation delivery is not configured.' }, { status: 503 });
    if (!authorized(request, secret)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    const templateName = env.WHATSAPP_TEMPLATE_CONFIRMATION_2D?.trim();
    const apiVersion = env.WHATSAPP_CLOUD_API_VERSION?.trim() || '';
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
    const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
    if (!templateName || !/^v\d+\.\d+$/.test(apiVersion) || !/^\d+$/.test(phoneNumberId) || !accessToken) {
      return Response.json({ error: 'WhatsApp confirmation delivery is not configured.' }, { status: 503 });
    }
    const client = createServiceClient();
    if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });
    const { data: claimed, error } = await client.rpc('claim_due_appointment_confirmations', { target_limit: MAX_CLAIM });
    if (error) return Response.json({ error: 'Could not claim confirmation requests.' }, { status: 503 });
    const counts = { claimed: (claimed || []).length, sent: 0, failed: 0, unknown: 0, skipped: 0 };
    for (const item of claimed || []) {
      const check = await client.rpc('get_claimed_appointment_confirmation', { target_request_id: item.request_id });
      if (check.error) {
        const settled = await client.rpc('settle_appointment_confirmation', {
          target_request_id: item.request_id, target_status: 'failed', target_error: 'Eligibility could not be rechecked; no provider request was made.',
        });
        if (settled.error || settled.data !== true) counts.unknown++;
        else counts.failed++;
        continue;
      }
      if (!check.data?.length) {
        const settled = await client.rpc('settle_appointment_confirmation', { target_request_id: item.request_id, target_status: 'skipped', target_error: 'Appointment is no longer eligible for confirmation.' });
        if (settled.error || settled.data !== true) counts.unknown++;
        else counts.skipped++;
        continue;
      }
      const row = check.data[0];
      let outcome = { status: 'unknown', messageId: null, error: 'WhatsApp outcome is uncertain.' };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadFor(row, templateName, env)), signal: controller.signal, cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.messages?.[0]?.id) outcome = { status: 'sent', messageId: data.messages[0].id, error: null };
        else if (response.status < 500) outcome = { status: 'failed', messageId: null, error: `WhatsApp API returned HTTP ${response.status}.` };
      } catch (error) {
        outcome = { status: 'unknown', messageId: null, error: error?.name === 'AbortError' ? 'WhatsApp request timed out; delivery is uncertain.' : 'WhatsApp connection failed; delivery is uncertain.' };
      } finally { clearTimeout(timeout); }
      const settled = await client.rpc('settle_appointment_confirmation', {
        target_request_id: item.request_id, target_status: outcome.status,
        target_message_id: outcome.messageId, target_error: outcome.error,
      });
      const status = settled.error || settled.data !== true ? 'unknown' : outcome.status;
      counts[status] = (counts[status] || 0) + 1;
    }
    return Response.json({ processed: counts.claimed, counts }, { headers: { 'Cache-Control': 'no-store' } });
  };
}
