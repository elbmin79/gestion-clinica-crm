import { createServiceClient } from '@/lib/supabase/service-client';
import { validExpoPushToken } from '@/lib/native-push-dispatch.js';
import { runStaffNativePush } from '@/lib/native-push.server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;
const respond = (request, body, status = 200) => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const origin = request.headers.get('origin');
  if (allowedOrigin(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
  return Response.json(body, { status, headers });
};
function allowedOrigin(origin) {
  if (!origin) return false;
  const configured = (process.env.MOBILE_APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return configured.includes(origin) || (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}
async function authorize(request, requireClinic = true) {
  const clinicId = new URL(request.url).searchParams.get('clinicId') || '';
  if (requireClinic && !/^[\da-f-]{36}$/i.test(clinicId)) return { error: respond(request, { error: 'Selecciona una clínica válida.' }, 400) };
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return { error: respond(request, { error: 'Inicia sesión para configurar este dispositivo.' }, 401) };
  const service = createServiceClient();
  if (!service) return { error: respond(request, { error: 'El servicio seguro del servidor no está configurado.' }, 503) };
  const { data: auth, error: authError } = await service.auth.getUser(accessToken);
  if (authError || !auth?.user) return { error: respond(request, { error: 'Tu sesión venció. Inicia sesión de nuevo.' }, 401) };
  if (requireClinic) {
    const { data: membership, error: membershipError } = await service.from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
    if (membershipError || !membership) return { error: respond(request, { error: 'No tienes acceso a esta clínica.' }, 403) };
  }
  return { service, user: auth.user, clinicId };
}
async function readBody(request) {
  const text = await request.text();
  if (text.length > 4096) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600', Vary: 'Origin',
  } });
}

export async function GET(request) {
  const context = await authorize(request); if (context.error) return context.error;
  const { data, error } = await context.service.from('staff_native_push_subscriptions')
    .select('id,platform,created_at').eq('clinic_id', context.clinicId).eq('user_id', context.user.id).order('created_at', { ascending: false });
  if (error) return respond(request, { error: 'No se pudo consultar la lista de dispositivos.' }, 503);
  return respond(request, { devices: data || [], deviceCount: (data || []).length });
}

export async function POST(request) {
  const context = await authorize(request); if (context.error) return context.error;
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return respond(request, { error: 'Solicitud inválida.' }, 400);
  if (body.action === 'status') {
    const { data, error } = await context.service.from('staff_native_push_subscriptions').select('id,expo_push_token')
      .eq('clinic_id', context.clinicId).eq('user_id', context.user.id);
    if (error) return respond(request, { error: 'No se pudo consultar la lista de dispositivos.' }, 503);
    return respond(request, { currentDeviceRegistered: validExpoPushToken(body.token) && (data || []).some(item => item.expo_push_token === body.token), deviceCount: (data || []).length });
  }
  if (body.action === 'register') {
    if (!validExpoPushToken(body.token) || !['ios', 'android'].includes(body.platform)) return respond(request, { error: 'El token o la plataforma del dispositivo no son válidos.' }, 400);
    const { data: existing, error: lookupError } = await context.service.from('staff_native_push_subscriptions')
      .select('id,user_id,clinic_id').eq('expo_push_token', body.token).maybeSingle();
    if (lookupError) return respond(request, { error: 'No se pudo consultar el dispositivo.' }, 503);
    if (existing && existing.user_id !== context.user.id) return respond(request, { error: 'Este dispositivo está vinculado a otra cuenta. Cierra esa sesión antes de activarlo.' }, 409);
    const values = { clinic_id: context.clinicId, user_id: context.user.id, expo_push_token: body.token, platform: body.platform };
    const result = existing
      ? await context.service.from('staff_native_push_subscriptions').update(values).eq('id', existing.id).eq('user_id', context.user.id)
      : await context.service.from('staff_native_push_subscriptions').insert(values);
    if (result.error) return respond(request, { error: 'No se pudo registrar el dispositivo. Vuelve a intentarlo.' }, 503);
    const { count } = await context.service.from('staff_native_push_subscriptions').select('id', { count: 'exact', head: true }).eq('clinic_id', context.clinicId).eq('user_id', context.user.id);
    return respond(request, { ok: true, deviceCount: count || 1 });
  }
  if (body.action === 'test') {
    if (!validExpoPushToken(body.token)) return respond(request, { error: 'Dispositivo inválido.' }, 400);
    const { data: device, error: lookupError } = await context.service.from('staff_native_push_subscriptions').select('id')
      .eq('clinic_id', context.clinicId).eq('user_id', context.user.id).eq('expo_push_token', body.token).maybeSingle();
    if (lookupError) return respond(request, { error: 'No se pudo consultar el dispositivo.' }, 503);
    if (!device) return respond(request, { error: 'Activa este dispositivo primero.' }, 400);
    const queued = await context.service.rpc('queue_staff_native_push_test', { target_clinic: context.clinicId, target_user: context.user.id, target_subscription: device.id });
    if (queued.error) return respond(request, { error: queued.error.message.includes('Wait one minute') ? 'Espera un minuto antes de repetir la prueba.' : 'No se pudo preparar la prueba.' }, queued.error.message.includes('Wait one minute') ? 429 : 503);
    try { return respond(request, { ok: true, counts: await runStaffNativePush(5) }); }
    catch { return respond(request, { error: 'La prueba quedó en cola; revisa el servicio de entrega.' }, 503); }
  }
  return respond(request, { error: 'Acción no válida.' }, 400);
}

export async function DELETE(request) {
  const body = await readBody(request);
  if (!body || !validExpoPushToken(body.token)) return respond(request, { error: 'Dispositivo inválido.' }, 400);
  const context = await authorize(request, body.action !== 'unlink-all'); if (context.error) return context.error;
  if (body.action === 'unlink-all') {
    const { error } = await context.service.from('staff_native_push_subscriptions').delete().eq('user_id', context.user.id).eq('expo_push_token', body.token);
    return error ? respond(request, { error: 'No se pudo desvincular este dispositivo.' }, 503) : respond(request, { ok: true });
  }
  const { error } = await context.service.from('staff_native_push_subscriptions').delete()
    .eq('clinic_id', context.clinicId).eq('user_id', context.user.id).eq('expo_push_token', body.token);
  return error ? respond(request, { error: 'No se pudo desactivar el dispositivo.' }, 503) : respond(request, { ok: true });
}
