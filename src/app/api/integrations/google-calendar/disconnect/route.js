import { NextResponse } from 'next/server';
import { decryptGoogleRefreshToken, getGoogleServiceClient, getUserGoogleCalendarConnection, requireClinicAccess } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician', 'receptionist', 'billing']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const connection = await getUserGoogleCalendarConnection(service, clinicId, access.user.id);
    if (!connection) return NextResponse.json({ error: 'No tienes una cuenta de Google conectada.' }, { status: 404 });
    const token = decryptGoogleRefreshToken(connection.refresh_token_ciphertext);
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }), cache: 'no-store',
    }).catch(() => {});
    const { error: linksError } = await service.from('clinic_google_calendar_event_links').delete()
      .eq('clinic_id', clinicId).eq('connected_by', access.user.id);
    if (linksError) throw linksError;
    const { error } = await service.from('clinic_google_calendar_connections').delete()
      .eq('clinic_id', clinicId).eq('connected_by', access.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo desconectar Google Calendar.' }, { status: 503 });
  }
}
