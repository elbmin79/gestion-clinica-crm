import { NextResponse } from 'next/server';
import {
  getGoogleCalendars, getGoogleServiceClient, getGoogleAccessToken,
  getUserGoogleCalendarConnection, requireClinicAccess,
} from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

async function authorize(request, body = null) {
  const clinicId = (typeof body?.clinicId === 'string' ? body.clinicId : request.nextUrl.searchParams.get('clinicId') || '').trim();
  if (!clinicId) return { error: 'Selecciona una clínica.', status: 400 };
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician', 'receptionist', 'billing']);
  if (access.error) return access;
  const service = getGoogleServiceClient();
  const connection = await getUserGoogleCalendarConnection(service, clinicId, access.user.id);
  if (!connection) return { error: 'Conecta primero tu cuenta de Google.', status: 404 };
  return { access, service, clinicId, connection };
}

export async function GET(request) {
  try {
    const authorized = await authorize(request);
    if (authorized.error) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
    const calendars = await getGoogleCalendars(await getGoogleAccessToken(authorized.connection));
    return NextResponse.json({ calendars, selectedCalendarId: authorized.connection.calendar_id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los calendarios de Google.' }, { status: 503 });
  }
}

export async function PATCH(request) {
  const body = await request.json().catch(() => null);
  const calendarId = typeof body?.calendarId === 'string' ? body.calendarId.trim() : '';
  if (!calendarId || calendarId.length > 1024) return NextResponse.json({ error: 'Selecciona un calendario válido.' }, { status: 400 });
  try {
    const authorized = await authorize(request, body);
    if (authorized.error) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
    const calendars = await getGoogleCalendars(await getGoogleAccessToken(authorized.connection));
    if (!calendars.some(calendar => calendar.id === calendarId)) return NextResponse.json({ error: 'La cuenta de Google no tiene permiso para editar ese calendario.' }, { status: 403 });
    const { error } = await authorized.service.from('clinic_google_calendar_connections')
      .update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
      .eq('clinic_id', authorized.clinicId).eq('connected_by', authorized.access.user.id);
    if (error) throw error;
    const { error: queueError } = await authorized.service.rpc('queue_google_calendar_user_initial_sync', {
      target_clinic_id: authorized.clinicId,
      target_user_id: authorized.access.user.id,
    });
    if (queueError) throw new Error('No se pudo preparar la sincronización de las próximas citas.');
    return NextResponse.json({ ok: true, calendarId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cambiar el calendario.' }, { status: 503 });
  }
}
