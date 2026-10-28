import { confirmationMessages, confirmationReplyForMessage, validWhatsAppSignature } from './whatsapp-confirmation.js';

export function createWhatsAppWebhookHandlers({ createServiceClient, env = process.env }) {
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
    const messages = confirmationMessages(payload);
    let processed = 0;
    for (const message of messages) {
      const reply = confirmationReplyForMessage(message);
      if (!reply) continue;
      const result = await client.rpc('apply_appointment_confirmation_reply', {
        target_context_message_id: reply.contextMessageId,
        target_inbound_message_id: reply.inboundMessageId,
        target_from: reply.from,
        target_action: reply.action,
      });
      if (result.error) return Response.json({ error: 'Could not apply appointment response.' }, { status: 503 });
      processed++;
    }
    return Response.json({ received: messages.length, processed }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return { GET, POST };
}
