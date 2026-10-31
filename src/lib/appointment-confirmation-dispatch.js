import { timingSafeEqual } from 'node:crypto';
import { loadClinicWhatsAppRoute } from './whatsapp/clinic-routing.js';
import { createWhatsAppProvider } from './whatsapp/provider.js';

const MAX_CLAIM = 10;

function authorized(request, expected) {
  const value = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(value) || !expected) return false;
  const supplied = Buffer.from(value.replace(/^Bearer\s+/i, ''));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

async function settle(client, requestId, status, messageId, error) {
  const { data, error: settleError } = await client.rpc('settle_appointment_confirmation', {
    target_request_id: requestId,
    target_status: status,
    target_message_id: messageId,
    target_error: error,
  });
  return !settleError && data === true;
}

export function createConfirmationDispatchHandler({
  createServiceClient,
  env = process.env,
  loadRoute = loadClinicWhatsAppRoute,
  createProvider = createWhatsAppProvider,
}) {
  return async function dispatch(request) {
    const secrets = [env.REMINDER_DISPATCH_SECRET, env.CRON_SECRET].map(value => value?.trim()).filter(Boolean);
    if (!secrets.length) return Response.json({ error: 'Confirmation dispatch is not configured.' }, { status: 503 });
    if (!secrets.some(secret => authorized(request, secret))) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

    const provider = createProvider({ env });
    if (!['mock', 'twilio'].includes(provider.mode) || provider.available === false) {
      return Response.json({ error: provider.error || 'WhatsApp provider is not configured.' }, { status: 503 });
    }
    const client = createServiceClient();
    if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });

    const { data: claimed, error: claimError } = await client.rpc('claim_due_appointment_confirmations', { target_limit: MAX_CLAIM });
    if (claimError) return Response.json({ error: 'Could not claim confirmation requests.' }, { status: 503 });
    const counts = { claimed: (claimed || []).length, sent: 0, failed: 0, unknown: 0, skipped: 0 };
    for (const item of claimed || []) {
      const { data: rows, error: checkError } = await client.rpc('get_claimed_appointment_confirmation_v2', { target_request_id: item.request_id });
      if (checkError) {
        counts[await settle(client, item.request_id, 'failed', null, 'Eligibility could not be rechecked; no provider call was made.') ? 'failed' : 'unknown'] += 1;
        continue;
      }
      if (!rows?.length) {
        counts[await settle(client, item.request_id, 'skipped', null, 'Appointment is no longer eligible for confirmation.') ? 'skipped' : 'unknown'] += 1;
        continue;
      }
      const appointment = rows[0];
      const route = await loadRoute(client, appointment.clinic_id, appointment.branch_id, 'confirmation_2d');
      if (!route.ok) {
        counts[await settle(client, item.request_id, 'failed', null, route.reason) ? 'failed' : 'unknown'] += 1;
        continue;
      }
      const result = await provider.sendTemplate({
        sender: route.sender,
        templateKind: 'confirmation_2d',
        contentSid: route.settings?.template_content_sids?.confirmation_2d,
        recipient: appointment.phone,
        context: { patientName: appointment.patient_name, appointmentAt: appointment.appointment_at },
      });
      const status = result.status === 'accepted' ? 'sent' : result.status;
      const error = result.error && result.simulated ? `Resultado simulado: ${result.error.replace(/^Resultado simulado:\s*/i, '')}` : result.error;
      const settled = await settle(client, item.request_id, status, result.messageId, error);
      counts[settled ? (result.status === 'accepted' ? 'sent' : result.status) : 'unknown'] += 1;
    }
    return Response.json({ processed: counts.claimed, mode: provider.mode, simulated: provider.simulated === true || provider.mode === 'mock', counts }, { headers: { 'Cache-Control': 'no-store' } });
  };
}
