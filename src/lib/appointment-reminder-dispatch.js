import { timingSafeEqual } from 'node:crypto';
import { loadClinicWhatsAppRoute } from './whatsapp/clinic-routing.js';
import { createWhatsAppProvider } from './whatsapp/provider.js';

const MAX_CLAIM = 3;

function authorized(request, expected) {
  const value = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(value) || !expected) return false;
  const supplied = Buffer.from(value.replace(/^Bearer\s+/i, ''));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

async function settle(client, reminderId, status, messageId, error) {
  const { data, error: settleError } = await client.rpc('settle_appointment_reminder', {
    target_reminder_id: reminderId,
    target_status: status,
    target_provider_message_id: messageId,
    target_error: error,
  });
  return !settleError && data === true;
}

export function createReminderDispatchHandler({
  createServiceClient,
  env = process.env,
  loadRoute = loadClinicWhatsAppRoute,
  createProvider = createWhatsAppProvider,
}) {
  return async function dispatch(request) {
    const secrets = [env.REMINDER_DISPATCH_SECRET, env.CRON_SECRET].map(value => value?.trim()).filter(Boolean);
    if (!secrets.length) return Response.json({ error: 'Reminder dispatch is not configured.' }, { status: 503 });
    if (!secrets.some(secret => authorized(request, secret))) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

    if (request.method === 'GET' && (
      env.WHATSAPP_PROVIDER_MODE !== 'twilio'
      || env.TWILIO_WHATSAPP_ENABLED !== 'true'
      || env.WHATSAPP_AUTOMATION_ENABLED !== 'true'
    )) {
      return Response.json({ processed: 0, skipped: true, mode: 'twilio', simulated: false, counts: { claimed: 0, sent: 0, failed: 0, unknown: 0, skipped: 0 } }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const provider = createProvider({ env });
    if (!['mock', 'twilio'].includes(provider.mode) || provider.available === false) {
      return Response.json({ error: provider.error || 'WhatsApp provider is not configured.' }, { status: 503 });
    }
    if (provider.mode === 'twilio' && env.WHATSAPP_AUTOMATION_ENABLED !== 'true') {
      return Response.json({ error: 'Automated WhatsApp delivery is disabled until explicitly enabled.' }, { status: 503 });
    }
    const client = createServiceClient();
    if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });

    const { data: claimed, error: claimError } = await client.rpc('claim_due_appointment_reminders', { target_limit: MAX_CLAIM });
    if (claimError) return Response.json({ error: 'Could not claim due appointment reminders.' }, { status: 503 });
    const counts = { claimed: (claimed || []).length, sent: 0, failed: 0, unknown: 0, skipped: 0 };
    for (const item of claimed || []) {
      const { data: rows, error: checkError } = await client.rpc('get_claimed_reminder_for_dispatch_v2', {
        target_reminder_id: item.reminder_id,
      });
      if (checkError) {
        const settled = await settle(client, item.reminder_id, 'failed', null, 'Could not recheck consent and appointment eligibility; no provider call was made.');
        counts[settled ? 'failed' : 'unknown'] += 1;
        continue;
      }
      if (!rows?.length) { counts.skipped += 1; continue; }
      const appointment = rows[0];
      const route = await loadRoute(client, appointment.clinic_id, appointment.branch_id, appointment.kind);
      if (!route.ok) {
        const settled = await settle(client, item.reminder_id, 'failed', null, route.reason);
        counts[settled ? 'failed' : 'unknown'] += 1;
        continue;
      }

      const result = await provider.sendTemplate({
        sender: route.sender,
        templateKind: appointment.kind,
        recipient: appointment.phone,
        context: { patientName: appointment.patient_name, appointmentAt: appointment.appointment_at },
      });
      const status = result.status === 'accepted' ? 'sent' : result.status;
      const error = result.error && result.simulated ? `Resultado simulado: ${result.error.replace(/^Resultado simulado:\s*/i, '')}` : result.error;
      const settled = await settle(client, item.reminder_id, status, result.messageId, error);
      const finalStatus = settled ? result.status : 'unknown';
      counts[finalStatus === 'accepted' ? 'sent' : finalStatus] += 1;
    }
    return Response.json({ processed: counts.claimed, mode: provider.mode, simulated: provider.simulated === true || provider.mode === 'mock', counts }, { headers: { 'Cache-Control': 'no-store' } });
  };
}
