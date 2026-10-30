import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  getGoogleAccount,
  getGoogleServiceClient,
  googleCalendarConfig,
  googleCalendarSettingsUrl,
  GOOGLE_CALENDAR_STATE_COOKIE,
  requireClinicAccess,
  requireProviderCalendarAccess,
  verifyGoogleCalendarState,
} from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

function clearStateCookie(response) {
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/integrations/google-calendar',
    maxAge: 0,
  });
  return response;
}

export async function GET(request) {
  const config = googleCalendarConfig();
  if (!config) return NextResponse.json({ error: 'Google Calendar todavía no está configurado en el servidor.' }, { status: 503 });
  const query = request.nextUrl.searchParams;
  if (query.has('error')) return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'cancelled')));

  const code = query.get('code');
  const stateValue = query.get('state');
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GOOGLE_CALENDAR_STATE_COOKIE)?.value;
  if (!code || !stateValue || !cookieState || stateValue !== cookieState) {
    return clearStateCookie(NextResponse.json({ error: 'La respuesta de Google no coincide con la solicitud iniciada.' }, { status: 400 }));
  }

  const state = verifyGoogleCalendarState(stateValue, config.clientSecret);
  if (!state?.clinicId || !state?.userId || !state?.nonce || state.exp < Date.now()) {
    return clearStateCookie(NextResponse.json({ error: 'La solicitud de autorización venció. Vuelve a conectar Google Calendar.' }, { status: 400 }));
  }

  const access = await requireClinicAccess(state.clinicId, ['admin', 'clinician']);
  if (access.error || access.user.id !== state.userId) {
    return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'unauthorized')));
  }

  const service = getGoogleServiceClient();
  if (!state.providerId) {
    return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'unauthorized')));
  }
  const providerAccess = await requireProviderCalendarAccess(service, {
    clinicId: state.clinicId,
    providerId: state.providerId,
    userId: access.user.id,
    role: access.role,
  });
  if (providerAccess.error) {
    return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'unauthorized')));
  }

  try {
    const token = await exchangeGoogleAuthorizationCode(code, config);
    const account = await getGoogleAccount(token.access_token);
    const table = 'clinic_provider_google_calendar_connections';
    const { data: current, error: currentError } = await service
      .from(table)
      .select('google_email, refresh_token_ciphertext')
      .eq('clinic_id', state.clinicId)
      .eq('provider_id', state.providerId)
      .maybeSingle();
    if (currentError) throw new Error('No se pudo leer la conexión anterior de la clínica. Aplica la migración de Google Calendar y vuelve a intentarlo.');

    let encryptedRefreshToken;
    if (token.refresh_token) encryptedRefreshToken = encryptGoogleRefreshToken(token.refresh_token);
    else if (current?.google_email?.toLowerCase() === account.email.toLowerCase()) {
      // Google may omit a new refresh token when the account has already granted access.
      // Preserve the valid stored token for the same Google account.
      decryptGoogleRefreshToken(current.refresh_token_ciphertext);
      encryptedRefreshToken = current.refresh_token_ciphertext;
    } else {
      throw new Error('Google no entregó un token de actualización. Revoca el acceso anterior a esta app en tu cuenta Google y vuelve a conectar.');
    }

    const connection = {
      clinic_id: state.clinicId,
      google_email: account.email,
      calendar_id: current?.google_email?.toLowerCase() === account.email.toLowerCase() ? current.calendar_id : 'primary',
      refresh_token_ciphertext: encryptedRefreshToken,
      connected_by: access.user.id,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    connection.provider_id = state.providerId;
    const { error: saveError } = await service.from(table).upsert(connection, {
      onConflict: 'clinic_id,provider_id',
    });
    if (saveError) throw new Error('No se pudo guardar la conexión en Supabase. Aplica la migración de Google Calendar y vuelve a intentarlo.');

    const { error: queueError } = await service.rpc('queue_google_calendar_provider_initial_sync', {
      target_clinic_id: state.clinicId,
      target_provider_id: state.providerId,
    });
    if (queueError) console.error('Google Calendar initial provider sync could not be queued:', queueError.message);

    return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'connected')));
  } catch (error) {
    const response = NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'error'));
    response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, '', { maxAge: 0, path: '/api/integrations/google-calendar' });
    // Do not put provider errors, authorization codes, or tokens into the redirect URL.
    console.error('Google Calendar OAuth callback failed:', error instanceof Error ? error.message : 'Unknown error');
    return response;
  }
}
