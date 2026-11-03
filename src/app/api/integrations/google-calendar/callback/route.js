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
  getUserGoogleCalendarConnection,
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

function mobileCallback(result) {
  const url = new URL('elixirclinic://google-calendar');
  url.searchParams.set('googleCalendar', result);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const config = googleCalendarConfig();
  if (!config) return NextResponse.json({ error: 'Google Calendar todavía no está configurado en el servidor.' }, { status: 503 });
  const query = request.nextUrl.searchParams;
  const code = query.get('code');
  const stateValue = query.get('state');
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GOOGLE_CALENDAR_STATE_COOKIE)?.value;
  const configState = stateValue ? verifyGoogleCalendarState(stateValue, config.clientSecret) : null;
  const isMobileFlow = configState?.mobile === true;
  if (query.has('error')) {
    const response = isMobileFlow ? mobileCallback('cancelled') : NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'cancelled'));
    return clearStateCookie(response);
  }
  if (!code || !stateValue || (!isMobileFlow && (!cookieState || stateValue !== cookieState))) {
    return clearStateCookie(NextResponse.json({ error: 'La respuesta de Google no coincide con la solicitud iniciada.' }, { status: 400 }));
  }

  const state = configState;
  if (!state?.clinicId || !state?.userId || !state?.nonce || state.exp < Date.now()) {
    return clearStateCookie(NextResponse.json({ error: 'La solicitud de autorización venció. Vuelve a conectar Google Calendar.' }, { status: 400 }));
  }

  const service = getGoogleServiceClient();
  if (isMobileFlow) {
    const { data: membership, error: membershipError } = await service.from('clinic_memberships').select('role')
      .eq('clinic_id', state.clinicId).eq('user_id', state.userId).maybeSingle();
    if (membershipError || !['admin', 'clinician', 'receptionist', 'billing'].includes(membership?.role)) {
      return clearStateCookie(mobileCallback('unauthorized'));
    }
  } else {
    const access = await requireClinicAccess(state.clinicId, ['admin', 'clinician', 'receptionist', 'billing']);
    if (access.error || access.user.id !== state.userId) {
      return clearStateCookie(NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'unauthorized')));
    }
  }

  try {
    const token = await exchangeGoogleAuthorizationCode(code, config);
    const account = await getGoogleAccount(token.access_token);
    const current = await getUserGoogleCalendarConnection(service, state.clinicId, state.userId);

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
      connected_by: state.userId,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await service.from('clinic_google_calendar_connections').upsert(connection, {
      onConflict: 'clinic_id,connected_by',
    });
    if (saveError) throw new Error('No se pudo guardar la conexión en Supabase. Aplica la migración de Google Calendar y vuelve a intentarlo.');

    const { error: queueError } = await service.rpc('queue_google_calendar_user_initial_sync', {
      target_clinic_id: state.clinicId,
      target_user_id: state.userId,
    });
    if (queueError) console.error('Google Calendar initial provider sync could not be queued:', queueError.message);

    return clearStateCookie(isMobileFlow ? mobileCallback('connected') : NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'connected')));
  } catch (error) {
    const response = isMobileFlow ? mobileCallback('error') : NextResponse.redirect(googleCalendarSettingsUrl(request.url, 'error'));
    response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, '', { maxAge: 0, path: '/api/integrations/google-calendar' });
    // Do not put provider errors, authorization codes, or tokens into the redirect URL.
    console.error('Google Calendar OAuth callback failed:', error instanceof Error ? error.message : 'Unknown error');
    return response;
  }
}
