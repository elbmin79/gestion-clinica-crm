import { NextResponse } from 'next/server';
import { getGoogleServiceClient, requireClinicAdmin } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAdmin(clinicId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const { data, error } = await service
      .from('clinic_google_calendar_connections')
      .select('google_email, calendar_id, connected_at, last_synced_at, last_sync_status, last_sync_error')
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) throw error;
    const { data: history, error: historyError } = await service
      .from('clinic_google_calendar_sync_jobs')
      .select('status, attempts, last_error, created_at, updated_at, completed_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(8);
    if (historyError) throw historyError;
    const { count: queued, error: queueError } = await service
      .from('clinic_google_calendar_sync_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'queued');
    if (queueError) throw queueError;
    return NextResponse.json({ connected: Boolean(data), connection: data || null, history: history || [], queued: queued || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el estado de Google Calendar. Revisa que la migración esté aplicada.' }, { status: 503 });
  }
}
