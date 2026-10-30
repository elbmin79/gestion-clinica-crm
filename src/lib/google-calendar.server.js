import 'server-only';

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from './supabase/server.js';
import { createServiceClient } from './supabase/service-client.js';

export const GOOGLE_CALENDAR_CALLBACK_PATH = '/api/integrations/google-calendar/callback';
export const GOOGLE_CALENDAR_STATE_COOKIE = 'clinic_google_calendar_oauth_state';
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
];

export function googleCalendarConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const parsed = new URL(redirectUri);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

export function tokenEncryptionKey() {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('Google Calendar token encryption is not configured.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Google Calendar token encryption key must be 32 bytes, base64 encoded.');
  return key;
}

export function encryptGoogleRefreshToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptGoogleRefreshToken(value) {
  const [version, ivValue, tagValue, cipherValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !cipherValue) throw new Error('Stored Google Calendar token is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function signGoogleCalendarState(payload, clientSecret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', clientSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyGoogleCalendarState(value, clientSecret) {
  const [encoded, signature, extra] = String(value || '').split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', clientSecret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
}

export async function requireClinicAccess(clinicId, allowedRoles = ['admin']) {
  const supabase = await createClient();
  if (!supabase) return { error: 'La conexión de la clínica no está disponible.', status: 503 };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Inicia sesión para continuar.', status: 401 };
  const { data: membership, error } = await supabase
    .from('clinic_memberships')
    .select('role')
    .eq('clinic_id', clinicId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return { error: 'No se pudo validar el acceso a la clínica.', status: 503 };
  if (!allowedRoles.includes(membership?.role)) return { error: 'Tu rol no tiene acceso a esta acción de Google Calendar.', status: 403 };
  return { supabase, user };
}

export function requireClinicAdmin(clinicId) {
  return requireClinicAccess(clinicId, ['admin']);
}

export function createGoogleOAuthAuthorizationUrl({ clinicId, userId, nonce, clientSecret, clientId, redirectUri }) {
  const state = signGoogleCalendarState({ clinicId, userId, nonce, exp: Date.now() + 10 * 60 * 1000 }, clientSecret);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return { url, state };
}

export async function exchangeGoogleAuthorizationCode(code, { clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.access_token) {
    throw new Error('Google no pudo completar la autorización. Revisa el Client ID, el secreto y la URI de redirección.');
  }
  return result;
}

export async function getGoogleAccount(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.email || user.email_verified !== true) {
    throw new Error('Google no devolvió una cuenta verificada.');
  }
  return user;
}

export async function getGoogleAccessToken(connection) {
  const config = googleCalendarConfig();
  if (!config) throw new Error('Google Calendar no está configurado en el servidor.');
  const refreshToken = decryptGoogleRefreshToken(connection.refresh_token_ciphertext);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.access_token) throw new Error('Google rechazó el token de actualización. Vuelve a conectar la cuenta.');
  return result.access_token;
}

export function googleEventId(appointmentId) {
  // Google event IDs accept lowercase base32hex characters; UUID hex is a subset.
  return `crm${String(appointmentId).replaceAll('-', '').toLowerCase()}`;
}

async function upsertCalendarEvent(accessToken, connection, appointment) {
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const eventId = googleEventId(appointment.id);
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
  const event = {
    id: eventId,
    summary: 'Cita de clínica',
    description: 'Cita agendada desde el CRM.',
    visibility: 'private',
    start: { dateTime: appointment.starts_at },
    end: { dateTime: appointment.ends_at },
    extendedProperties: { private: { clinicAppointmentId: appointment.id } },
  };

  const updateResponse = await fetch(eventUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
  });
  if (updateResponse.ok) return;
  if (updateResponse.status !== 404) throw new Error(`Google Calendar API devolvió ${updateResponse.status}.`);

  const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
  });
  if (createResponse.ok || createResponse.status === 409) return;
  throw new Error(`Google Calendar API devolvió ${createResponse.status}.`);
}

async function deleteCalendarEvent(accessToken, connection, appointmentId) {
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const eventId = googleEventId(appointmentId);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw new Error(`Google Calendar API devolvió ${response.status}.`);
}

export async function runGoogleCalendarSync(service, { clinicId = null, limit = 10 } = {}) {
  const { data: jobs, error: claimError } = await service.rpc('claim_google_calendar_sync_jobs', {
    target_clinic_id: clinicId,
    target_limit: limit,
  });
  if (claimError) throw new Error('No se pudieron reclamar las tareas de Google Calendar. Aplica la migración y vuelve a intentarlo.');

  const accessTokens = new Map();
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs || []) {
    let failure = '';
    try {
      const { data: connection, error: connectionError } = await service
        .from('clinic_google_calendar_connections')
        .select('clinic_id, calendar_id, refresh_token_ciphertext')
        .eq('clinic_id', job.clinic_id)
        .maybeSingle();
      if (connectionError || !connection) throw new Error('Google Calendar ya no está conectado para esta clínica.');
      let accessToken = accessTokens.get(job.clinic_id);
      if (!accessToken) {
        accessToken = await getGoogleAccessToken(connection);
        accessTokens.set(job.clinic_id, accessToken);
      }
      const { data: appointment, error: appointmentError } = await service
        .from('appointments')
        .select('id, clinic_id, starts_at, ends_at, status')
        .eq('clinic_id', job.clinic_id)
        .eq('id', job.appointment_id)
        .maybeSingle();
      if (appointmentError || !appointment) throw new Error('La cita no está disponible para sincronizar.');

      if (appointment.status === 'cancelled') await deleteCalendarEvent(accessToken, connection, appointment.id);
      else if (appointment.status !== 'completed') await upsertCalendarEvent(accessToken, connection, appointment);

      const now = new Date().toISOString();
      const { error: updateError } = await service
        .from('clinic_google_calendar_sync_jobs')
        .update({ status: 'succeeded', completed_at: now, updated_at: now, last_error: null })
        .eq('id', job.job_id);
      if (updateError) throw new Error('No se pudo guardar el resultado de sincronización.');
      await service.from('clinic_google_calendar_connections').update({
        last_synced_at: now,
        last_sync_status: 'success',
        last_sync_error: null,
        updated_at: now,
      }).eq('clinic_id', job.clinic_id);
      succeeded += 1;
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 500) : 'Falló la sincronización con Google Calendar.';
      const now = new Date();
      const finalFailure = job.attempts >= 6;
      const nextAttempt = new Date(now.getTime() + Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.max(0, job.attempts - 1))));
      await service.from('clinic_google_calendar_sync_jobs').update({
        status: finalFailure ? 'failed' : 'queued',
        next_attempt_at: finalFailure ? now.toISOString() : nextAttempt.toISOString(),
        last_error: failure,
        updated_at: now.toISOString(),
        completed_at: finalFailure ? now.toISOString() : null,
      }).eq('id', job.job_id);
      await service.from('clinic_google_calendar_connections').update({
        last_sync_status: 'error',
        last_sync_error: failure,
        updated_at: now.toISOString(),
      }).eq('clinic_id', job.clinic_id);
      failed += 1;
    }
  }
  return { processed: (jobs || []).length, succeeded, failed };
}

export function getGoogleServiceClient() {
  const client = createServiceClient();
  if (!client) throw new Error('El acceso de servidor a Supabase no está configurado.');
  return client;
}

export function googleCalendarSettingsUrl(requestUrl, result = '') {
  const url = new URL('/configuracion', requestUrl);
  url.searchParams.set('googleCalendar', result);
  return url;
}
