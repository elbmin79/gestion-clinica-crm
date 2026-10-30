import { NextResponse } from 'next/server';
import { decryptGoogleRefreshToken, getGoogleServiceClient, requireClinicAccess, requireProviderCalendarAccess } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
  if (!clinicId || !providerId) return NextResponse.json({ error: 'Falta la clínica o el profesional vinculado a tu cuenta.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const providerAccess = await requireProviderCalendarAccess(service, {
      clinicId, providerId, userId: access.user.id, role: access.role,
    });
    if (providerAccess.error) return NextResponse.json({ error: providerAccess.error }, { status: providerAccess.status });
    const table = 'clinic_provider_google_calendar_connections';
    let connectionQuery = service
      .from(table)
      .select('refresh_token_ciphertext')
      .eq('clinic_id', clinicId);
    connectionQuery = connectionQuery.eq('provider_id', providerId);
    const { data, error } = await connectionQuery.maybeSingle();
    if (error) throw error;
    if (data?.refresh_token_ciphertext) {
      const token = decryptGoogleRefreshToken(data.refresh_token_ciphertext);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        cache: 'no-store',
      }).catch(() => {});
    }
    let linksQuery = service.from('clinic_google_calendar_event_links').delete().eq('clinic_id', clinicId);
    linksQuery = linksQuery.eq('provider_id', providerId);
    const { error: linksError } = await linksQuery;
    if (linksError) throw linksError;
    let deleteQuery = service.from(table).delete().eq('clinic_id', clinicId);
    deleteQuery = deleteQuery.eq('provider_id', providerId);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo desconectar Google Calendar.' }, { status: 503 });
  }
}
