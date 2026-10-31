import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';

export const runtime = 'nodejs';

async function getAuthorizedContext(request) {
  const session = await createClient();
  if (!session) return { response: Response.json({ error: 'La conexión de la clínica no está configurada.' }, { status: 503 }) };
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { response: Response.json({ error: 'Inicia sesión para administrar conversaciones.' }, { status: 401 }) };
  let payload = {};
  try { payload = await request.json(); } catch { return { response: Response.json({ error: 'Solicitud inválida.' }, { status: 400 }) }; }
  const clinicId = String(payload?.clinicId || '');
  if (!/^[\da-f-]{36}$/i.test(clinicId)) return { response: Response.json({ error: 'Selecciona una clínica válida.' }, { status: 400 }) };
  const { data: membership } = await session.from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['admin', 'receptionist'].includes(membership.role)) return { response: Response.json({ error: 'No tienes permiso para administrar esta conversación.' }, { status: 403 }) };
  const service = createServiceClient();
  if (!service) return { response: Response.json({ error: 'El servicio de WhatsApp no está disponible.' }, { status: 503 }) };
  return { clinicId, service, payload };
}

export async function PATCH(request, { params }) {
  const [{ conversationId }, context] = await Promise.all([params, getAuthorizedContext(request)]);
  if (context.response) return context.response;
  if (!/^[\da-f-]{36}$/i.test(String(conversationId || ''))) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  const action = context.payload.action;
  if (!['block', 'unblock'].includes(action)) return Response.json({ error: 'Acción inválida.' }, { status: 400 });
  const { data, error } = await context.service.from('clinic_whatsapp_conversations')
    .update({ blocked_at: action === 'block' ? new Date().toISOString() : null })
    .eq('clinic_id', context.clinicId).eq('id', conversationId).select('id,blocked_at').maybeSingle();
  if (error) return Response.json({ error: 'No se pudo actualizar el bloqueo de la conversación.' }, { status: 503 });
  if (!data) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  return Response.json({ ok: true, blockedAt: data.blocked_at });
}

export async function DELETE(request, { params }) {
  const [{ conversationId }, context] = await Promise.all([params, getAuthorizedContext(request)]);
  if (context.response) return context.response;
  if (!/^[\da-f-]{36}$/i.test(String(conversationId || ''))) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  const { data: conversation, error: conversationError } = await context.service.from('clinic_whatsapp_conversations')
    .select('id').eq('clinic_id', context.clinicId).eq('id', conversationId).maybeSingle();
  if (conversationError) return Response.json({ error: 'No se pudo cargar la conversación.' }, { status: 503 });
  if (!conversation) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });

  const paths = [];
  const messageSids = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await context.service.from('clinic_whatsapp_messages').select('media_object_path,twilio_message_sid')
      .eq('clinic_id', context.clinicId).eq('conversation_id', conversationId)
      .range(offset, offset + 999);
    if (error) return Response.json({ error: 'No se pudieron preparar los archivos de la conversación para eliminar.' }, { status: 503 });
    paths.push(...(data || []).map(item => item.media_object_path).filter(Boolean));
    messageSids.push(...(data || []).map(item => item.twilio_message_sid).filter(Boolean));
    if ((data || []).length < 1000) break;
  }
  for (let offset = 0; offset < paths.length; offset += 1000) {
    const { error } = await context.service.storage.from(WHATSAPP_MEDIA_BUCKET).remove(paths.slice(offset, offset + 1000));
    if (error) return Response.json({ error: 'No se pudieron eliminar todos los archivos. La conversación sigue disponible.' }, { status: 503 });
  }
  for (let offset = 0; offset < messageSids.length; offset += 1000) {
    const { error } = await context.service.from('clinic_whatsapp_message_status_events').delete()
      .in('twilio_message_sid', messageSids.slice(offset, offset + 1000));
    if (error) return Response.json({ error: 'No se pudieron eliminar los estados guardados. La conversación sigue disponible.' }, { status: 503 });
  }
  const { data: deleted, error: deleteError } = await context.service.from('clinic_whatsapp_conversations').delete()
    .eq('clinic_id', context.clinicId).eq('id', conversationId).select('id').maybeSingle();
  if (deleteError) return Response.json({ error: 'No se pudo eliminar la conversación.' }, { status: 503 });
  if (!deleted) return Response.json({ error: 'No se encontró la conversación.' }, { status: 404 });
  return Response.json({ ok: true });
}
