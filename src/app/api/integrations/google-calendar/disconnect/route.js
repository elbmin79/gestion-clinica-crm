import { NextResponse } from 'next/server';
import { decryptGoogleRefreshToken, getGoogleServiceClient, requireClinicAdmin } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAdmin(clinicId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const { data, error } = await service
      .from('clinic_google_calendar_connections')
      .select('refresh_token_ciphertext')
      .eq('clinic_id', clinicId)
      .maybeSingle();
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
    const { error: jobsError } = await service
      .from('clinic_google_calendar_sync_jobs')
      .delete()
      .eq('clinic_id', clinicId);
    if (jobsError) throw jobsError;
    const { error: deleteError } = await service
      .from('clinic_google_calendar_connections')
      .delete()
      .eq('clinic_id', clinicId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo desconectar Google Calendar.' }, { status: 503 });
  }
}
