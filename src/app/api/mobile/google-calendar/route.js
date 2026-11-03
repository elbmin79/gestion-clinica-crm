import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import {
  createGoogleOAuthAuthorizationUrl,
  decryptGoogleRefreshToken,
  getGoogleCalendars,
  getGoogleAccessToken,
  getGoogleServiceClient,
  getUserGoogleCalendarConnection,
  googleCalendarConfig,
  runGoogleCalendarSync,
} from '@/lib/google-calendar.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_ROLES = ['admin', 'clinician', 'receptionist', 'billing'];
const CLINIC_ID = /^[\da-f-]{36}$/i;

function allowedOrigin(origin) {
  if (!origin) return false;
  const configured = (process.env.MOBILE_APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return configured.includes(origin) || (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

function respond(request, body, status = 200) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const origin = request.headers.get('origin');
  if (allowedOrigin(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
  return NextResponse.json(body, { status, headers });
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > 4096) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function authorize(request, clinicId) {
  if (!CLINIC_ID.test(clinicId || '')) return { error: { error: 'Selecciona una clínica válida.' }, status: 400 };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { error: { error: 'Inicia sesión para administrar Google Calendar.' }, status: 401 };
  const service = createServiceClient();
  if (!service) return { error: { error: 'El servicio seguro del servidor no está configurado.' }, status: 503 };
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth?.user) return { error: { error: 'Tu sesión venció. Inicia sesión de nuevo.' }, status: 401 };
  const { data: membership, error: membershipError } = await service.from('clinic_memberships')
    .select('role').eq('clinic_id', clinicId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError) return { error: { error: 'No se pudo validar el acceso a la clínica.' }, status: 503 };
  if (!ALLOWED_ROLES.includes(membership?.role)) return { error: { error: 'Tu rol no tiene acceso a Google Calendar.' }, status: 403 };
  return { service, user: auth.user, clinicId };
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600', Vary: 'Origin',
  } });
}

export async function GET(request) {
  const query = new URL(request.url).searchParams;
  const clinicId = (query.get('clinicId') || '').trim();
  const context = await authorize(request, clinicId);
  if (context.error) return respond(request, context.error, context.status);
  const action = query.get('action') || 'status';
  try {
    const service = getGoogleServiceClient();
    const connection = await getUserGoogleCalendarConnection(service, clinicId, context.user.id);
    if (action === 'calendars') {
      if (!connection) return respond(request, { error: 'Conecta primero tu cuenta de Google.' }, 404);
      try {
        const calendars = await getGoogleCalendars(await getGoogleAccessToken(connection));
        return respond(request, { calendars, selectedCalendarId: connection.calendar_id });
      } catch (error) {
        return respond(request, { error: error instanceof Error ? error.message : 'No se pudieron consultar los calendarios de Google.' }, 503);
      }
    }
    if (action !== 'status') return respond(request, { error: 'Acción desconocida.' }, 400);
    let history = [];
    let queued = 0;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: appointments, error: appointmentError } = await service.from('appointments').select('id').eq('clinic_id', clinicId).gte('starts_at', since);
    if (appointmentError) throw appointmentError;
    const appointmentIds = (appointments || []).map(item => item.id);
    if (appointmentIds.length) {
      const [historyResult, queueResult] = await Promise.all([
        service.from('clinic_google_calendar_sync_jobs').select('status,attempts,last_error,created_at,updated_at,completed_at')
          .eq('clinic_id', clinicId).eq('user_id', context.user.id).in('appointment_id', appointmentIds).order('created_at', { ascending: false }).limit(8),
        service.from('clinic_google_calendar_sync_jobs').select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinicId).eq('user_id', context.user.id).in('appointment_id', appointmentIds).eq('status', 'queued'),
      ]);
      if (historyResult.error || queueResult.error) throw historyResult.error || queueResult.error;
      history = historyResult.data || [];
      queued = queueResult.count || 0;
    }
    const safeConnection = connection ? {
      google_email: connection.google_email,
      calendar_id: connection.calendar_id,
      connected_at: connection.connected_at,
      last_synced_at: connection.last_synced_at,
      last_sync_status: connection.last_sync_status,
      last_sync_error: connection.last_sync_error,
    } : null;
    return respond(request, { connection: safeConnection, history, queued });
  } catch {
    return respond(request, { error: 'No se pudo cargar el estado de Google Calendar. Revisa la configuración del servidor y la migración.' }, 503);
  }
}

export async function POST(request) {
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return respond(request, { error: 'Solicitud inválida.' }, 400);
  const clinicId = typeof body.clinicId === 'string' ? body.clinicId.trim() : '';
  const context = await authorize(request, clinicId);
  if (context.error) return respond(request, context.error, context.status);
  const action = body.action;
  try {
    const service = getGoogleServiceClient();
    const connection = await getUserGoogleCalendarConnection(service, clinicId, context.user.id);
    if (action === 'connect') {
      const config = googleCalendarConfig();
      if (!config) return respond(request, { error: 'Google Calendar todavía no está configurado en el servidor.' }, 503);
      const { url } = createGoogleOAuthAuthorizationUrl({
        clinicId, userId: context.user.id, nonce: randomBytes(32).toString('base64url'), mobile: true,
        clientSecret: config.clientSecret, clientId: config.clientId, redirectUri: config.redirectUri,
      });
      return respond(request, { authorizationUrl: url.toString() });
    }
    if (action === 'sync') {
      if (!connection) return respond(request, { error: 'Conecta primero tu cuenta de Google Calendar.' }, 409);
      const initial = body.initial === true;
      if (initial) {
        const { error } = await service.rpc('queue_google_calendar_user_initial_sync', { target_clinic_id: clinicId, target_user_id: context.user.id });
        if (error) throw new Error('No se pudieron preparar las próximas citas para sincronizarlas.');
      }
      const result = await runGoogleCalendarSync(service, { clinicId, userId: context.user.id, limit: initial ? 20 : 25 });
      const { count, error } = await service.from('clinic_google_calendar_sync_jobs').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('user_id', context.user.id).eq('status', 'queued');
      if (error) throw error;
      return respond(request, { ok: true, ...result, queued: count || 0 });
    }
    if (action === 'calendar') {
      const calendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : '';
      if (!calendarId || calendarId.length > 1024) return respond(request, { error: 'Selecciona un calendario válido.' }, 400);
      if (!connection) return respond(request, { error: 'Conecta primero tu cuenta de Google.' }, 404);
      const calendars = await getGoogleCalendars(await getGoogleAccessToken(connection));
      if (!calendars.some(calendar => calendar.id === calendarId)) return respond(request, { error: 'La cuenta de Google no tiene permiso para editar ese calendario.' }, 403);
      const { error } = await service.from('clinic_google_calendar_connections').update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId).eq('connected_by', context.user.id);
      if (error) throw error;
      const queued = await service.rpc('queue_google_calendar_user_initial_sync', { target_clinic_id: clinicId, target_user_id: context.user.id });
      if (queued.error) throw new Error('No se pudo preparar la sincronización de las próximas citas.');
      return respond(request, { ok: true, calendarId });
    }
    if (action === 'disconnect') {
      if (!connection) return respond(request, { error: 'No tienes una cuenta de Google conectada.' }, 404);
      const refreshToken = decryptGoogleRefreshToken(connection.refresh_token_ciphertext);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }), cache: 'no-store',
      }).catch(() => {});
      const { error: linksError } = await service.from('clinic_google_calendar_event_links').delete().eq('clinic_id', clinicId).eq('connected_by', context.user.id);
      if (linksError) throw linksError;
      const { error } = await service.from('clinic_google_calendar_connections').delete().eq('clinic_id', clinicId).eq('connected_by', context.user.id);
      if (error) throw error;
      return respond(request, { ok: true });
    }
    return respond(request, { error: 'Acción no válida.' }, 400);
  } catch (error) {
    return respond(request, { error: error instanceof Error ? error.message : 'No se pudo completar la acción de Google Calendar.' }, 503);
  }
}
