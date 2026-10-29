import { confirmationEvents, confirmationReplyForMessage, validWhatsAppSignature } from './whatsapp-confirmation.js';
import { resolveInboundWhatsAppSender } from './whatsapp/clinic-routing.js';

export function createWhatsAppWebhookHandlers({ createServiceClient, env = process.env, resolveSender = resolveInboundWhatsAppSender }) {
  async function GET(request) {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';
    const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || '';
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge) return new Response('Forbidden', { status: 403 });
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  async function POST(request) {
    const rawBody = await request.text();
    const secret = env.WHATSAPP_APP_SECRET?.trim() || '';
    if (!validWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256') || '', secret)) {
      return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    }
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const client = createServiceClient();
    if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });
    const events = confirmationEvents(payload);
    let processed = 0;
    for (const event of events) {
      const message = event.message;
      const reply = confirmationReplyForMessage(message);
      if (!reply) continue;
      const route = await resolveSender(client, event.phoneNumberId);
      if (!route?.clinicId) continue;
      const result = await client.rpc('apply_appointment_confirmation_reply_v2', {
        target_clinic_id: route.clinicId,
        target_branch_id: route.branchId || null,
        target_context_message_id: reply.contextMessageId,
        target_inbound_message_id: reply.inboundMessageId,
        target_from: reply.from,
        target_action: reply.action,
      });
      if (result.error) return Response.json({ error: 'Could not apply appointment response.' }, { status: 503 });
      processed++;
    }
    return Response.json({ received: events.length, processed }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return { GET, POST };
}
