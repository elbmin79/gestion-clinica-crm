import { NextResponse } from 'next/server';
import { createGoogleOAuthAuthorizationUrl, getGoogleServiceClient, googleCalendarConfig, GOOGLE_CALENDAR_STATE_COOKIE, requireClinicAccess, requireProviderCalendarAccess } from '../../../../../lib/google-calendar.server.js';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET(request) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  const providerId = request.nextUrl.searchParams.get('providerId')?.trim() || null;
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });

  const config = googleCalendarConfig();
  if (!config) return NextResponse.json({ error: 'Google Calendar todavía no está configurado en el servidor.' }, { status: 503 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const service = getGoogleServiceClient();
  if (providerId) {
    const providerAccess = await requireProviderCalendarAccess(service, {
      clinicId, providerId, userId: access.user.id, role: access.role,
    });
    if (providerAccess.error) return NextResponse.json({ error: providerAccess.error }, { status: providerAccess.status });
  } else {
    if (access.role !== 'admin') return NextResponse.json({ error: 'Solo administración puede conectar el calendario compartido de la clínica.' }, { status: 403 });
    const { data: existing, error } = await service
      .from('clinic_google_calendar_connections')
      .select('connected_by')
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo validar la cuenta de Google conectada.' }, { status: 503 });
    if (existing && existing.connected_by !== access.user.id) return NextResponse.json({ error: 'El calendario compartido está conectado por otra cuenta administradora.' }, { status: 409 });
  }

  const nonce = randomBytes(32).toString('base64url');
  const { url, state } = createGoogleOAuthAuthorizationUrl({
    clinicId,
    providerId,
    userId: access.user.id,
    nonce,
    clientSecret: config.clientSecret,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
  });
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/integrations/google-calendar',
    maxAge: 10 * 60,
  });
  return response;
}
