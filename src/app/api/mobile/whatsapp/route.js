import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service-client';
import { twilioWhatsAppStatusCallbackUrl } from '@/lib/twilio-whatsapp-webhook';
import { hasClinicPermission } from '@/lib/clinic-permissions.js';
import { setConversationBlocked } from '@/lib/whatsapp/conversation-actions.js';
import { isWhatsAppReplyWindowOpen } from '@/lib/whatsapp/reply-window.js';
import { getWhatsAppMediaType, isWhatsAppMediaPath, WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';

export const runtime = 'nodejs';

function allowedOrigin(origin) {
  if (!origin) return false;
  const configured = (process.env.MOBILE_APP_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function json(request, body, status = 200) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const origin = request.headers.get('origin');
  if (allowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return Response.json(body, { status, headers });
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

async function authorize(request, clinicId, permission) {
  if (!/^[\da-f-]{36}$/i.test(clinicId)) return { error: 'Selecciona una clínica válida.', status: 400 };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { error: 'Inicia sesión para usar WhatsApp.', status: 401 };
  const service = createServiceClient();
  if (!service) return { error: 'El servicio de WhatsApp no está disponible.', status: 503 };
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth?.user) return { error: 'Tu sesión venció. Inicia sesión de nuevo.', status: 401 };
  const { data: membership, error: membershipError } = await service.from('clinic_memberships')
    .select('role,permissions').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError || !membership || !hasClinicPermission(membership.role, membership.permissions, permission)) {
    const message = permission === 'whatsapp.reply' ? 'No tienes permiso para responder desde esta clínica.'
      : permission === 'whatsapp.manage' ? 'No tienes permiso para administrar conversaciones desde esta clínica.'
        : 'No tienes permiso para ver WhatsApp en esta clínica.';
    return { error: message, status: 403 };
  }
  return { service, user: auth.user };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinicId') || '';
  const conversationId = url.searchParams.get('conversationId') || '';
  const mediaMessageId = url.searchParams.get('mediaMessageId') || '';
  const context = await authorize(request, clinicId, 'whatsapp.view');
  if (context.error) return json(request, { error: context.error }, context.status);

  if (mediaMessageId) {
    if (!/^[\da-f-]{36}$/i.test(conversationId) || !/^[\da-f-]{36}$/i.test(mediaMessageId)) return json(request, { error: 'Archivo no encontrado.' }, 404);
    const { data: message } = await context.service.from('clinic_whatsapp_messages')
      .select('media_object_path,media_content_type').eq('clinic_id', clinicId).eq('conversation_id', conversationId).eq('id', mediaMessageId).maybeSingle();
    if (!message?.media_object_path || !getWhatsAppMediaType(message.media_content_type) || !isWhatsAppMediaPath(message.media_object_path, clinicId, conversationId)) {
      return json(request, { error: 'Archivo no encontrado.' }, 404);
    }
    const { data: signed, error: signError } = await context.service.storage.from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(message.media_object_path, 3600, { download: false });
    if (signError || !signed?.signedUrl) return json(request, { error: 'No se pudo abrir el archivo.' }, 503);
    return json(request, { url: signed.signedUrl, contentType: message.media_content_type });
  }

  const conversationsResult = await context.service.from('clinic_whatsapp_conversations')
    .select('id,contact_phone,contact_name,sender_phone,last_inbound_at,last_message_at,blocked_at,latest_message:clinic_whatsapp_messages(body,direction,media_content_type,created_at)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false, referencedTable: 'latest_message' })
    .limit(1, { referencedTable: 'latest_message' })
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (conversationsResult.error) return json(request, { error: 'No se pudieron cargar las conversaciones.' }, 503);

  let messages = [];
  if (conversationId) {
    if (!/^[\da-f-]{36}$/i.test(conversationId)) return json(request, { error: 'No se encontró la conversación.' }, 404);
    const result = await context.service.from('clinic_whatsapp_messages')
      .select('id,direction,body,delivery_status,delivery_error_code,delivery_error_message,created_at,media_object_path,media_content_type,media_filename,media_size_bytes')
      .eq('clinic_id', clinicId).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(300);
    if (result.error) return json(request, { error: 'No se pudieron cargar los mensajes.' }, 503);
    messages = (result.data || []).map(({ media_object_path: mediaPath, ...message }) => ({
      ...message,
      media_available: Boolean(getWhatsAppMediaType(message.media_content_type) && mediaPath && isWhatsAppMediaPath(mediaPath, clinicId, conversationId)),
    }));
  }
  return json(request, { conversations: conversationsResult.data || [], messages });
}

export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { return json(request, { error: 'Solicitud inválida.' }, 400); }
  const clinicId = String(payload?.clinicId || '');
  const conversationId = String(payload?.conversationId || '');
  if (['block', 'unblock'].includes(payload?.action)) {
    if (!/^[\da-f-]{36}$/i.test(conversationId)) return json(request, { error: 'No se encontró la conversación.' }, 404);
    const context = await authorize(request, clinicId, 'whatsapp.manage');
    if (context.error) return json(request, { error: context.error }, context.status);
    const result = await setConversationBlocked(context.service, clinicId, conversationId, payload.action);
    if (result.error) return json(request, { error: result.error }, result.status);
    return json(request, { ok: true, blockedAt: result.blockedAt });
  }
  if (payload?.action === 'delete-conversation') {
    if (!/^[\da-f-]{36}$/i.test(conversationId)) return json(request, { error: 'No se encontró la conversación.' }, 404);
    const context = await authorize(request, clinicId, 'whatsapp.manage');
    if (context.error) return json(request, { error: context.error }, context.status);
    const { data: conversation, error: conversationError } = await context.service.from('clinic_whatsapp_conversations')
      .select('id').eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
    if (conversationError) return json(request, { error: 'No se pudo cargar la conversación.' }, 503);
    if (!conversation) return json(request, { error: 'No se encontró la conversación.' }, 404);
    const paths = [];
    const messageSids = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.service.from('clinic_whatsapp_messages').select('media_object_path,twilio_message_sid')
        .eq('clinic_id', clinicId).eq('conversation_id', conversationId).range(offset, offset + 999);
      if (error) return json(request, { error: 'No se pudieron preparar los archivos de la conversación para eliminar.' }, 503);
      paths.push(...(data || []).map(item => item.media_object_path).filter(Boolean));
      messageSids.push(...(data || []).map(item => item.twilio_message_sid).filter(Boolean));
      if ((data || []).length < 1000) break;
    }
    for (let offset = 0; offset < paths.length; offset += 1000) {
      const { error } = await context.service.storage.from(WHATSAPP_MEDIA_BUCKET).remove(paths.slice(offset, offset + 1000));
      if (error) return json(request, { error: 'No se pudieron eliminar todos los archivos. La conversación sigue disponible.' }, 503);
    }
    for (let offset = 0; offset < messageSids.length; offset += 1000) {
      const { error } = await context.service.from('clinic_whatsapp_message_status_events').delete()
        .in('twilio_message_sid', messageSids.slice(offset, offset + 1000));
      if (error) return json(request, { error: 'No se pudieron eliminar los estados guardados. La conversación sigue disponible.' }, 503);
    }
    const { data: deleted, error: deleteError } = await context.service.from('clinic_whatsapp_conversations').delete()
      .eq('clinic_id', clinicId).eq('id', conversationId).select('id').maybeSingle();
    if (deleteError) return json(request, { error: 'No se pudo eliminar la conversación.' }, 503);
    if (!deleted) return json(request, { error: 'No se encontró la conversación.' }, 404);
    return json(request, { ok: true });
  }
  if (payload?.action === 'prepare-media-upload') {
    const contentType = String(payload?.contentType || '').split(';')[0].trim().toLowerCase();
    const size = Number(payload?.size);
    const mediaType = getWhatsAppMediaType(contentType);
    if (!/^[\da-f-]{36}$/i.test(conversationId) || !mediaType || !Number.isSafeInteger(size) || size < 1 || size > mediaType.maxBytes) {
      return json(request, { error: 'Elige una imagen JPG o PNG (máximo 5 MB), un video MP4 o un audio compatible (máximo 16 MB).' }, 400);
    }
    const context = await authorize(request, clinicId, 'whatsapp.reply');
    if (context.error) return json(request, { error: context.error }, context.status);
    const { data: conversation } = await context.service.from('clinic_whatsapp_conversations')
      .select('id,last_inbound_at,blocked_at').eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
    if (!conversation) return json(request, { error: 'No se encontró la conversación.' }, 404);
    if (conversation.blocked_at) return json(request, { error: 'Este contacto está bloqueado en el CRM. Desbloquéalo antes de responder.' }, 409);
    if (!isWhatsAppReplyWindowOpen(conversation.last_inbound_at)) {
      return json(request, { error: 'La ventana para responder terminó. Espera un nuevo mensaje del contacto.' }, 409);
    }
    const path = `${clinicId}/${conversationId}/${randomUUID()}.${mediaType.extension}`;
    const { data: signed, error: uploadError } = await context.service.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (uploadError || !signed?.token) return json(request, { error: 'No se pudo preparar la carga del archivo.' }, 503);
    return json(request, { path, token: signed.token, contentType, size });
  }

  const body = String(payload?.body || '').trim();
  if (!/^[\da-f-]{36}$/i.test(conversationId) || payload?.action !== 'send-text' || !body || body.length > 4096) {
    return json(request, { error: 'Escribe un mensaje de hasta 4096 caracteres.' }, 400);
  }
  const context = await authorize(request, clinicId, 'whatsapp.reply');
  if (context.error) return json(request, { error: context.error }, context.status);

  const { data: conversation, error: conversationError } = await context.service.from('clinic_whatsapp_conversations')
    .select('id,contact_phone,sender_phone,last_inbound_at,blocked_at')
    .eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
  if (conversationError) return json(request, { error: 'No se pudo cargar la conversación.' }, 503);
  if (!conversation) return json(request, { error: 'No se encontró la conversación.' }, 404);
  if (conversation.blocked_at) return json(request, { error: 'Este contacto está bloqueado en el CRM. Desbloquéalo antes de responder.' }, 409);
  if (!isWhatsAppReplyWindowOpen(conversation.last_inbound_at)) {
    return json(request, { error: 'La ventana para responder terminó. Espera un nuevo mensaje del contacto.' }, 409);
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) return json(request, { error: 'Falta configurar la conexión de WhatsApp.' }, 503);
  const from = String(conversation.sender_phone || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(from) || !/^\+[1-9]\d{7,14}$/.test(conversation.contact_phone)) return json(request, { error: 'El remitente o destinatario no es válido.' }, 400);
  const statusCallbackUrl = twilioWhatsAppStatusCallbackUrl(process.env);
  if (!statusCallbackUrl) return json(request, { error: 'No está configurada la URL pública para recibir los estados de WhatsApp.' }, 503);

  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  let response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `whatsapp:${conversation.contact_phone}`, From: `whatsapp:${from}`, Body: body, StatusCallback: statusCallbackUrl }).toString(),
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
  } catch {
    return json(request, { error: 'No se pudo confirmar el envío. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, 502);
  }
  let result = {};
  try { result = await response.json(); } catch { /* Use the provider's generic error below. */ }
  const messageSid = String(result.sid || '');
  if (!response.ok) {
    const code = String(result.code || result.error_code || '');
    return json(request, { error: `Twilio rechazó el mensaje${code ? ` (${code})` : ''}.` }, 502);
  }
  if (!/^(?:SM|MM)[0-9a-fA-F]{32}$/.test(messageSid)) return json(request, { error: 'Twilio no confirmó el mensaje. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, 502);

  const initialStatus = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled'].includes(String(result.status || '').toLowerCase())
    ? String(result.status).toLowerCase() : 'queued';
  const saved = await context.service.from('clinic_whatsapp_messages').insert({
    clinic_id: clinicId, conversation_id: conversationId, direction: 'outbound', body,
    twilio_message_sid: messageSid, delivery_status: initialStatus,
  });
  if (saved.error) return json(request, { error: 'Twilio envió el mensaje, pero el CRM no pudo guardarlo. Comprueba WhatsApp y no lo vuelvas a enviar.', sent: true, uncertain: true }, 503);
  await context.service.rpc('apply_twilio_whatsapp_message_status', {
    target_message_sid: messageSid, target_delivery_status: initialStatus, target_error_code: null, target_error_message: null,
  });
  await context.service.from('clinic_whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId).eq('clinic_id', clinicId);
  return json(request, { ok: true });
}
