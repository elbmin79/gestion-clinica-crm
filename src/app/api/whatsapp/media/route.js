import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp/media.server.js';
import { hasClinicPermission } from '@/lib/clinic-permissions.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const session = await createClient();
  if (!session) return Response.json({ error: 'La conexión de la clínica no está configurada.' }, { status: 503 });
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'Inicia sesión para ver este archivo.' }, { status: 401 });
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinicId') || '';
  const messageId = url.searchParams.get('messageId') || '';
  const download = url.searchParams.get('download') === '1';
  if (!/^[\da-f-]{36}$/i.test(clinicId) || !/^[\da-f-]{36}$/i.test(messageId)) return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 });
  const { data: membership } = await session.from('clinic_memberships').select('role,permissions').eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle();
  if (!membership || !hasClinicPermission(membership.role, membership.permissions, 'whatsapp.view')) return Response.json({ error: 'No tienes permiso para ver este archivo.' }, { status: 403 });
  const { data: message } = await session.from('clinic_whatsapp_messages').select('media_object_path,media_content_type,media_filename').eq('clinic_id', clinicId).eq('id', messageId).maybeSingle();
  if (!message?.media_object_path || !message.media_content_type) return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 });
  const service = createServiceClient();
  if (!service) return Response.json({ error: 'El servicio de archivos no está disponible.' }, { status: 503 });
  const downloadName = String(message.media_filename || 'whatsapp-media').replace(/[\\/\r\n\0]/g, '_').slice(0, 120);
  const { data, error } = await service.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(message.media_object_path, 3600, { download: download ? downloadName : false });
  if (error || !data?.signedUrl) return Response.json({ error: 'No se pudo abrir el archivo.' }, { status: 503 });
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
