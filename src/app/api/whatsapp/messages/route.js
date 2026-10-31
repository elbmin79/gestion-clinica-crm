import { Buffer } from 'node:buffer';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { getWhatsAppMediaType, hasWhatsAppMediaSignature, isWhatsAppMediaPath, WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const session = await createClient();
  if (!session) return Response.json({ error: 'La conexión de la clínica no está configurada.' }, { status: 503 });
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'Inicia sesión para responder.' }, { status: 401 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  const clinicId = String(payload?.clinicId || '');
  const conversationId = String(payload?.conversationId || '');
  const body = String(payload?.body || '').trim();
  const mediaPath = String(payload?.mediaPath || '');
  if (!/^[\da-f-]{36}$/i.test(clinicId) || !/^[\da-f-]{36}$/i.test(conversationId) || (!body && !mediaPath) || body.length > 4096) {
    return Response.json({ error: 'Escribe un mensaje o adjunta una imagen o video.' }, { status: 400 });
  }
  const { data: membership } = await session.from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['admin', 'receptionist'].includes(membership.role)) return Response.json({ error: 'No tienes permiso para responder desde esta clínica.' }, { status: 403 });
  const service = createServiceClient();
  if (!service) return Response.json({ error: 'El servicio de mensajería no está disponible.' }, { status: 503 });
  const { data: conversation } = await service.from('clinic_whatsapp_conversations').select('id,clinic_id,contact_phone,sender_phone,last_inbound_at').eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
  if (!conversation) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  const inboundAt = Date.parse(conversation.last_inbound_at || '');
  if (!Number.isFinite(inboundAt) || Date.now() - inboundAt > 24 * 60 * 60 * 1000) {
    return Response.json({ error: 'La ventana para responder terminó. Espera un nuevo mensaje del contacto.' }, { status: 409 });
  }
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) return Response.json({ error: 'Falta configurar la conexión de WhatsApp.' }, { status: 503 });
  const from = String(conversation.sender_phone || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(from) || !/^\+[1-9]\d{7,14}$/.test(conversation.contact_phone)) return Response.json({ error: 'El remitente o destinatario no es válido.' }, { status: 400 });
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  let media = null;
  if (mediaPath) {
    if (!isWhatsAppMediaPath(mediaPath, clinicId, conversationId)) return Response.json({ error: 'El archivo no pertenece a esta conversación.' }, { status: 400 });
    const { data: file, error: fileError } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).download(mediaPath);
    if (fileError || !file) return Response.json({ error: 'No se pudo recuperar el archivo adjunto. Vuelve a seleccionarlo.' }, { status: 400 });
    const contentType = String(file.type || '').split(';')[0].trim().toLowerCase();
    const type = getWhatsAppMediaType(contentType);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!type || bytes.length < 1 || bytes.length > type.maxBytes || !hasWhatsAppMediaSignature(bytes, contentType)) {
      return Response.json({ error: 'El archivo no es compatible o supera el límite permitido.' }, { status: 400 });
    }
    if (type.kind === 'video' && body) return Response.json({ error: 'WhatsApp no permite texto junto con video. Envía el texto aparte o borra el texto antes de enviar el video.' }, { status: 400 });
    const requestedFilename = String(payload?.mediaFilename || '').split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
    const filenameStem = requestedFilename.replace(/\.[^.]+$/, '').slice(0, 100) || (type.kind === 'video' ? 'video' : 'imagen');
    media = { path: mediaPath, contentType, size: bytes.length, filename: `${filenameStem}.${type.extension}`, kind: type.kind };
  }
  const form = new URLSearchParams({ To: `whatsapp:${conversation.contact_phone}`, From: `whatsapp:${from}` });
  if (body) form.set('Body', body);
  if (media) {
    const { data: signed, error: signError } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(media.path, 3600, { download: false });
    if (signError || !signed?.signedUrl) return Response.json({ error: 'No se pudo preparar el archivo para enviarlo.' }, { status: 503 });
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
    return Response.json({ error: 'No se pudo confirmar el envío. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, { status: 502 });
  }
  let result = {};
  try { result = await response.json(); } catch { /* Report the generic provider error below. */ }
  const hasMessageSid = /^(?:SM|MM)[0-9a-fA-F]{32}$/.test(result.sid || '');
  if (!response.ok) {
    const code = String(result.code || result.error_code || '');
    const providerMessage = String(result.message || result.error_message || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    console.error('Twilio rejected WhatsApp send.', { httpStatus: response.status, code: code || null, message: providerMessage || null });
    return Response.json({ error: `Twilio rechazó el mensaje${code ? ` (${code})` : ''}.${providerMessage ? ` ${providerMessage}` : ''}` }, { status: 502 });
  }
  if (!hasMessageSid) {
    console.error('Twilio WhatsApp send returned success without a valid message SID.', { httpStatus: response.status, status: result.status || null });
    return Response.json({ error: 'Twilio respondió, pero no confirmó el mensaje. Comprueba si llegó antes de volver a intentarlo.', uncertain: true }, { status: 502 });
  }
  const saved = await service.from('clinic_whatsapp_messages').insert({
    clinic_id: clinicId,
    conversation_id: conversationId,
    direction: 'outbound',
    body,
    twilio_message_sid: result.sid,
    delivery_status: ['queued', 'sent', 'delivered'].includes(result.status) ? result.status : 'queued',
    ...(media ? { media_object_path: media.path, media_content_type: media.contentType, media_filename: media.filename, media_size_bytes: media.size } : {}),
  });
  if (saved.error) {
    console.error('Sent WhatsApp message could not be saved to the CRM.', { code: saved.error.code || null });
    return Response.json({ error: 'Twilio envió el mensaje, pero el CRM no pudo guardarlo. Comprueba WhatsApp y no lo vuelvas a enviar.', sent: true, uncertain: true }, { status: 503 });
  }
  await service.from('clinic_whatsapp_conversations').update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversationId).eq('clinic_id', clinicId);
  return Response.json({ ok: true });
}
