import { NextResponse } from 'next/server';
import {
  getGoogleCalendars,
  getGoogleServiceClient,
  getGoogleAccessToken,
  getProviderGoogleCalendarConnection,
  requireClinicAccess,
  requireProviderCalendarAccess,
} from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

async function authorizeProvider(request, body = null) {
  const clinicId = (typeof body?.clinicId === 'string' ? body.clinicId : request.nextUrl.searchParams.get('clinicId') || '').trim();
  const providerId = (typeof body?.providerId === 'string' ? body.providerId : request.nextUrl.searchParams.get('providerId') || '').trim();
  if (!clinicId || !providerId) return { error: 'Selecciona una clínica y un profesional.', status: 400 };
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician']);
  if (access.error) return access;
  const service = getGoogleServiceClient();
  const providerAccess = await requireProviderCalendarAccess(service, {
    clinicId, providerId, userId: access.user.id, role: access.role,
  });
  if (providerAccess.error) return providerAccess;
  const connection = await getProviderGoogleCalendarConnection(service, clinicId, providerId);
  if (!connection) return { error: 'Conecta primero una cuenta de Google para este profesional.', status: 404 };
  return { access, service, clinicId, providerId, connection };
}

export async function GET(request) {
  try {
    const authorized = await authorizeProvider(request);
    if (authorized.error) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
    const accessToken = await getGoogleAccessToken(authorized.connection);
    const calendars = await getGoogleCalendars(accessToken);
    return NextResponse.json({ calendars, selectedCalendarId: authorized.connection.calendar_id }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los calendarios de Google.' }, { status: 503 });
  }
}

export async function PATCH(request) {
  const body = await request.json().catch(() => null);
  const calendarId = typeof body?.calendarId === 'string' ? body.calendarId.trim() : '';
  if (!calendarId || calendarId.length > 1024) {
    return NextResponse.json({ error: 'Selecciona un calendario válido.' }, { status: 400 });
  }
  try {
    const authorized = await authorizeProvider(request, body);
    if (authorized.error) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
    const accessToken = await getGoogleAccessToken(authorized.connection);
    const calendars = await getGoogleCalendars(accessToken);
    if (!calendars.some(calendar => calendar.id === calendarId)) {
      return NextResponse.json({ error: 'La cuenta de Google no tiene permiso para editar ese calendario.' }, { status: 403 });
    }
    const { error } = await authorized.service
      .from('clinic_provider_google_calendar_connections')
      .update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
      .eq('clinic_id', authorized.clinicId)
      .eq('provider_id', authorized.providerId);
    if (error) throw error;
    const { error: queueError } = await authorized.service.rpc('queue_google_calendar_provider_initial_sync', {
      target_clinic_id: authorized.clinicId,
      target_provider_id: authorized.providerId,
    });
    if (queueError) throw new Error('No se pudo preparar la sincronización de las próximas citas.');
    return NextResponse.json({ ok: true, calendarId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cambiar el calendario.' }, { status: 503 });
  }
}
