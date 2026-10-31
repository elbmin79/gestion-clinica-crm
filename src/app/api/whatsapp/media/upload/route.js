import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { getWhatsAppMediaType, WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const session = await createClient();
  if (!session) return Response.json({ error: 'La conexión de la clínica no está configurada.' }, { status: 503 });
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'Inicia sesión para adjuntar archivos.' }, { status: 401 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  const clinicId = String(payload?.clinicId || '');
  const conversationId = String(payload?.conversationId || '');
  const contentType = String(payload?.contentType || '').toLowerCase();
  const size = Number(payload?.size);
  const type = getWhatsAppMediaType(contentType);
  if (!/^[\da-f-]{36}$/i.test(clinicId) || !/^[\da-f-]{36}$/i.test(conversationId) || !type || !Number.isSafeInteger(size) || size < 1 || size > type.maxBytes) {
    return Response.json({ error: 'Elige una imagen JPG o PNG (máximo 5 MB) o un video MP4 (máximo 16 MB).' }, { status: 400 });
  }
  const { data: membership } = await session.from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['admin', 'receptionist'].includes(membership.role)) return Response.json({ error: 'No tienes permiso para adjuntar archivos en esta clínica.' }, { status: 403 });
  const service = createServiceClient();
  if (!service) return Response.json({ error: 'El servicio de archivos no está disponible.' }, { status: 503 });
  const { data: conversation } = await service.from('clinic_whatsapp_conversations').select('id,last_inbound_at').eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle();
  if (!conversation) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  const inboundAt = Date.parse(conversation.last_inbound_at || '');
  if (!Number.isFinite(inboundAt) || Date.now() - inboundAt > 24 * 60 * 60 * 1000) {
    return Response.json({ error: 'La ventana para responder terminó. Espera un nuevo mensaje del contacto.' }, { status: 409 });
  }
  const path = `${clinicId}/${conversationId}/${randomUUID()}.${type.extension}`;
  const { data, error } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) return Response.json({ error: 'No se pudo preparar la carga del archivo.' }, { status: 503 });
  return Response.json({ path, token: data.token, contentType, size }, { headers: { 'Cache-Control': 'no-store' } });
}
