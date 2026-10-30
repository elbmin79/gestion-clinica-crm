import { NextResponse } from 'next/server';
import { createGoogleOAuthAuthorizationUrl, googleCalendarConfig, GOOGLE_CALENDAR_STATE_COOKIE, requireClinicAdmin } from '../../../../../lib/google-calendar.server.js';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET(request) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });

  const config = googleCalendarConfig();
  if (!config) return NextResponse.json({ error: 'Google Calendar todavía no está configurado en el servidor.' }, { status: 503 });
  const access = await requireClinicAdmin(clinicId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const nonce = randomBytes(32).toString('base64url');
  const { url, state } = createGoogleOAuthAuthorizationUrl({
    clinicId,
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
