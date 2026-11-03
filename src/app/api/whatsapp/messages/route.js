import { Buffer } from 'node:buffer';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { twilioWhatsAppStatusCallbackUrl } from '@/lib/twilio-whatsapp-webhook';
import { getWhatsAppMediaType, hasWhatsAppMediaSignature, isWhatsAppMediaPath, WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';
import { hasClinicPermission } from '@/lib/clinic-permissions.js';

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

export async function POST(request) {
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const session = bearerToken ? null : await createClient();
  if (!bearerToken && !session) return json(request, { error: 'La conexión de la clínica no está configurada.' }, 503);
  const service = createServiceClient();
  if (!service) return json(request, { error: 'El servicio de mensajería no está disponible.' }, 503);
  let user = null;
  if (bearerToken) {
    const { data: auth, error: authError } = await service.auth.getUser(bearerToken);
    if (authError || !auth?.user) return json(request, { error: 'Tu sesión venció. Inicia sesión de nuevo.' }, 401);
    user = auth.user;
  } else {
    const { data: auth } = await session.auth.getUser();
    user = auth?.user || null;
  }
  if (!user) return json(request, { error: 'Inicia sesión para responder.' }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json(request, { error: 'Solicitud inválida.' }, 400); }
  const clinicId = String(payload?.clinicId || '');
  const conversationId = String(payload?.conversationId || '');
  const body = String(payload?.body || '').trim();
  const mediaPath = String(payload?.mediaPath || '');
  if (!/^[\da-f-]{36}$/i.test(clinicId) || !/^[\da-f-]{36}$/i.test(conversationId) || (!body && !mediaPath) || body.length > 4096) {
    return json(request, { error: 'Escribe un mensaje o adjunta una imagen o video.' }, 400);
  }
  const membershipClient = bearerToken ? service : session;
  const { data: membership } = await membershipClient.from('clinic_memberships').select('role,permissions').eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle();
  if (!membership || !hasClinicPermission(membership.role, membership.permissions, 'whatsapp.reply')) return json(request, { error: 'No tienes permiso para responder desde esta clínica.' }, 403);
  const { data: conversation } = await service.from('clinic_whatsapp_conversations').select('id,clinic_id,contact_phone,sender_phone,last_inbound_at,blocked_at').eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
  if (!conversation) return json(request, { error: 'No se encontró la conversación.' }, 404);
  if (conversation.blocked_at) return json(request, { error: 'Este contacto está bloqueado en el CRM. Desbloquéalo antes de responder.' }, 409);
  const inboundAt = Date.parse(conversation.last_inbound_at || '');
  if (!Number.isFinite(inboundAt) || Date.now() - inboundAt > 24 * 60 * 60 * 1000) {
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
  let media = null;
  if (mediaPath) {
    if (!isWhatsAppMediaPath(mediaPath, clinicId, conversationId)) return json(request, { error: 'El archivo no pertenece a esta conversación.' }, 400);
    const { data: file, error: fileError } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).download(mediaPath);
    if (fileError || !file) return json(request, { error: 'No se pudo recuperar el archivo adjunto. Vuelve a seleccionarlo.' }, 400);
    const contentType = String(file.type || '').split(';')[0].trim().toLowerCase();
    const type = getWhatsAppMediaType(contentType);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!type || bytes.length < 1 || bytes.length > type.maxBytes || !hasWhatsAppMediaSignature(bytes, contentType)) {
      return json(request, { error: 'El archivo no es compatible o supera el límite permitido.' }, 400);
    }
    if (type.kind === 'video' && body) return json(request, { error: 'WhatsApp no permite texto junto con video. Envía el texto aparte o borra el texto antes de enviar el video.' }, 400);
    const requestedFilename = String(payload?.mediaFilename || '').split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
    const filenameStem = requestedFilename.replace(/\.[^.]+$/, '').slice(0, 100) || (type.kind === 'video' ? 'video' : 'imagen');
    media = { path: mediaPath, contentType, size: bytes.length, filename: `${filenameStem}.${type.extension}`, kind: type.kind };
  }
  const form = new URLSearchParams({ To: `whatsapp:${conversation.contact_phone}`, From: `whatsapp:${from}` });
  form.set('StatusCallback', statusCallbackUrl);
  if (body) form.set('Body', body);
  if (media) {
    const { data: signed, error: signError } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(media.path, 3600, { download: false });
    if (signError || !signed?.signedUrl) return json(request, { error: 'No se pudo preparar el archivo para enviarlo.' }, 503);
    form.set('MediaUrl', signed.signedUrl);
  }
  let response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(), signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
  } catch {
    console.error('Twilio WhatsApp send outcome is unknown after request timeout.');
    return json(request, { error: 'No se pudo confirmar el envío. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, 502);
  }
  let result = {};
  try { result = await response.json(); } catch { /* Report the generic provider error below. */ }
  const hasMessageSid = /^(?:SM|MM)[0-9a-fA-F]{32}$/.test(result.sid || '');
  if (!response.ok) {
    const code = String(result.code || result.error_code || '');
    const providerMessage = String(result.message || result.error_message || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    console.error('Twilio rejected WhatsApp send.', { httpStatus: response.status, code: code || null, message: providerMessage || null });
    return json(request, { error: `Twilio rechazó el mensaje${code ? ` (${code})` : ''}.${providerMessage ? ` ${providerMessage}` : ''}` }, 502);
  }
  if (!hasMessageSid) {
    console.error('Twilio WhatsApp send returned success without a valid message SID.', { httpStatus: response.status, status: result.status || null });
    return json(request, { error: 'Twilio respondió, pero no confirmó el mensaje. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, 502);
  }
  const initialStatus = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled'].includes(String(result.status || '').toLowerCase())
    ? String(result.status).toLowerCase()
    : 'queued';
  const saved = await service.from('clinic_whatsapp_messages').insert({
    clinic_id: clinicId,
    conversation_id: conversationId,
    direction: 'outbound',
    body,
    twilio_message_sid: result.sid,
    delivery_status: initialStatus,
    ...(media ? { media_object_path: media.path, media_content_type: media.contentType, media_filename: media.filename, media_size_bytes: media.size } : {}),
  });
  if (saved.error) {
    console.error('Sent WhatsApp message could not be saved to the CRM.', { code: saved.error.code || null });
    return json(request, { error: 'Twilio envió el mensaje, pero el CRM no pudo guardarlo. Comprueba WhatsApp y no lo vuelvas a enviar.', sent: true, uncertain: true }, 503);
  }
  const statusSaved = await service.rpc('apply_twilio_whatsapp_message_status', {
    target_message_sid: result.sid,
    target_delivery_status: initialStatus,
    target_error_code: null,
    target_error_message: null,
  });
  if (statusSaved.error) console.error('Initial WhatsApp delivery status could not be synchronized.', { code: statusSaved.error.code || null });
  await service.from('clinic_whatsapp_conversations').update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversationId).eq('clinic_id', clinicId);
  return json(request, { ok: true });
}
