import twilio from 'twilio';
import { actionFromWhatsAppMessage } from './whatsapp-confirmation.js';
import { resolveInboundTwilioWhatsAppSender } from './whatsapp/clinic-routing.js';
import { downloadTwilioWhatsAppMedia, getWhatsAppMediaType, WHATSAPP_MEDIA_BUCKET } from './whatsapp/media.server.js';

const webhookPath = '/api/webhooks/twilio/whatsapp';

function canonicalWebhookUrl(request, env) {
  const baseUrl = String(env.TWILIO_WEBHOOK_PUBLIC_BASE_URL || '').trim();
  if (!baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) return null;
    const incoming = new URL(request.url);
    return `${base.origin}${webhookPath}${incoming.search}`;
  } catch {
    return null;
  }
}

function emptyTwiML() {
  return new Response('<Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function createStaffWhatsAppAlert(client, { clinicId, messageSid, event }) {
  const configColumn = event === 'message' ? 'notify_whatsapp_messages' : 'notify_whatsapp_confirmations';
  const { data: config, error: configError } = await client.from('clinic_whatsapp_configurations')
    .select(configColumn).eq('clinic_id', clinicId).maybeSingle();
  if (configError || config?.[configColumn] !== true) return;
  const { data: members, error: membersError } = await client.from('clinic_memberships')
    .select('user_id').eq('clinic_id', clinicId).in('role', ['admin', 'receptionist']);
  if (membersError || !members?.length) return;
  const isMessage = event === 'message';
  const notifications = members.map(member => ({
    clinic_id: clinicId,
    user_id: member.user_id,
    kind: isMessage ? 'whatsapp_message' : 'whatsapp_confirmation',
    message: isMessage ? 'Nuevo mensaje de WhatsApp' : 'Cita confirmada por WhatsApp',
    source_event_id: `${messageSid}:${event}`,
  }));
  await client.from('staff_notifications').upsert(notifications, {
    onConflict: 'clinic_id,user_id,source_event_id',
    ignoreDuplicates: true,
  });
}

export function createTwilioWhatsAppWebhookHandler({
  createServiceClient,
  env = process.env,
  resolveSender = resolveInboundTwilioWhatsAppSender,
} = {}) {
  return async function POST(request) {
    const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
    const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
    const requestUrl = canonicalWebhookUrl(request, env);
    const signature = request.headers.get('x-twilio-signature') || '';
    if (!authToken || !/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !requestUrl || !signature) {
      return Response.json({ error: 'Twilio webhook is not configured.' }, { status: 503 });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      return Response.json({ error: 'Unsupported webhook content type.' }, { status: 415 });
    }
    const rawBody = await request.text();
    if (rawBody.length > 65536) return Response.json({ error: 'Webhook payload is too large.' }, { status: 413 });
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    let valid = false;
    try { valid = twilio.validateRequest(authToken, signature, requestUrl, params); } catch { valid = false; }
    if (!valid) return Response.json({ error: 'Invalid Twilio signature.' }, { status: 401 });
    if (params.AccountSid !== accountSid) return Response.json({ error: 'Twilio account mismatch.' }, { status: 403 });

    const messageSid = String(params.MessageSid || params.SmsMessageSid || '').trim();
    const from = String(params.From || '').replace(/^whatsapp:/i, '').trim();
    const to = String(params.To || '').replace(/^whatsapp:/i, '').trim();
    if (!/^(?:SM|MM)[0-9a-fA-F]{32}$/.test(messageSid)
      || !/^\+[1-9]\d{7,14}$/.test(from)
      || !/^\+[1-9]\d{7,14}$/.test(to)) return Response.json({ error: 'Invalid inbound WhatsApp message.' }, { status: 400 });

    const action = actionFromWhatsAppMessage({ text: { body: params.Body || '' } });
    const client = createServiceClient?.();
    if (!client) return Response.json({ error: 'Server-side Supabase configuration is incomplete.' }, { status: 503 });
    let route = await resolveSender(client, to);
    if (!route?.clinicId && to === '+14155238886') {
      const sandboxRoute = await client.rpc('route_twilio_sandbox_whatsapp', { target_phone: to });
      if (sandboxRoute.error) return Response.json({ error: 'Could not route Sandbox message.' }, { status: 503 });
      const clinicId = sandboxRoute.data?.[0]?.clinic_id;
      if (clinicId) route = { clinicId, branchId: null };
    }
    if (!route?.clinicId) return emptyTwiML();
    const mediaCount = Number(params.NumMedia || 0) || 0;
    const inboundBody = String(params.Body || '').trim();
    const contactName = String(params.ProfileName || '').trim().slice(0, 120);
    const { data: conversation, error: conversationError } = await client
      .from('clinic_whatsapp_conversations')
      .upsert({ clinic_id: route.clinicId, contact_phone: from, ...(contactName ? { contact_name: contactName } : {}), sender_phone: to, last_inbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'clinic_id,contact_phone' })
      .select('id,blocked_at')
      .single();
    if (conversationError || !conversation) return Response.json({ error: 'Could not save inbound WhatsApp conversation.' }, { status: 503 });
    const contentType = String(params.MediaContentType0 || '').split(';')[0].trim().toLowerCase();
    const mediaType = mediaCount > 0 ? getWhatsAppMediaType(contentType) : null;
    let media = null;
    let mediaPath = null;
    if (mediaType && params.MediaUrl0) {
      try {
        media = await downloadTwilioWhatsAppMedia({ mediaUrl: params.MediaUrl0, contentType, accountSid, authToken, messageSid });
        mediaPath = `${route.clinicId}/${conversation.id}/${messageSid}.${media.extension}`;
        const { error: uploadError } = await client.storage.from(WHATSAPP_MEDIA_BUCKET).upload(mediaPath, media.bytes, { contentType: media.contentType, cacheControl: '0', upsert: true });
        if (uploadError) return Response.json({ error: 'Could not store inbound WhatsApp media.' }, { status: 503 });
      } catch {
        return Response.json({ error: 'Could not retrieve inbound WhatsApp media.' }, { status: 503 });
      }
    }
    const hasLocation = Boolean(params.Latitude && params.Longitude);
    const messageBody = inboundBody || (mediaPath ? '' : hasLocation ? 'Ubicación compartida (vista previa aún no disponible).' : mediaCount ? 'Archivo multimedia no compatible con esta bandeja.' : 'Mensaje sin texto.');
    const { error: messageError } = await client.from('clinic_whatsapp_messages').upsert({
      clinic_id: route.clinicId,
      conversation_id: conversation.id,
      direction: 'inbound',
      body: messageBody,
      twilio_message_sid: messageSid,
      delivery_status: 'received',
      ...(mediaPath ? { media_object_path: mediaPath, media_content_type: media.contentType, media_filename: `${media.kind}-${messageSid.slice(-6)}.${media.extension}`, media_size_bytes: media.size } : {}),
    }, { onConflict: 'twilio_message_sid', ignoreDuplicates: true });
    if (messageError) return Response.json({ error: 'Could not save inbound WhatsApp message.' }, { status: 503 });
    if (!conversation.blocked_at) {
      try { await createStaffWhatsAppAlert(client, { clinicId: route.clinicId, messageSid, event: 'message' }); } catch { /* Inbox persistence must not depend on the optional staff alert. */ }
    }
    if (action && !conversation.blocked_at) {
      const result = await client.rpc('apply_appointment_confirmation_reply_v2', {
        target_clinic_id: route.clinicId,
        target_branch_id: route.branchId || null,
        target_context_message_id: String(params.OriginalRepliedMessageSid || '').trim() || null,
        target_inbound_message_id: messageSid,
        target_from: from,
        target_action: action,
      });
      if (result.error) return Response.json({ error: 'Could not apply appointment response.' }, { status: 503 });
      if (result.data === 'confirmed') {
        try { await createStaffWhatsAppAlert(client, { clinicId: route.clinicId, messageSid, event: 'confirmation' }); } catch { /* The appointment response is already applied. */ }
      }
    }
    return emptyTwiML();
  };
}

export { canonicalWebhookUrl };
