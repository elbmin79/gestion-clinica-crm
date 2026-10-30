import { NextResponse } from 'next/server';
import { getGoogleServiceClient, requireClinicAccess, getUserGoogleCalendarConnection } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician', 'receptionist', 'billing']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const storedConnection = await getUserGoogleCalendarConnection(service, clinicId, access.user.id);
    const connection = storedConnection ? {
      google_email: storedConnection.google_email,
      calendar_id: storedConnection.calendar_id,
      connected_at: storedConnection.connected_at,
      last_synced_at: storedConnection.last_synced_at,
      last_sync_status: storedConnection.last_sync_status,
      last_sync_error: storedConnection.last_sync_error,
    } : null;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: appointments, error: appointmentError } = await service
      .from('appointments').select('id').eq('clinic_id', clinicId).gte('starts_at', since);
    if (appointmentError) throw appointmentError;
    const appointmentIds = (appointments || []).map(item => item.id);
    let history = [];
    let queued = 0;
    if (appointmentIds.length) {
      const { data, error } = await service.from('clinic_google_calendar_sync_jobs')
        .select('status, attempts, last_error, created_at, updated_at, completed_at')
        .eq('clinic_id', clinicId).eq('user_id', access.user.id).in('appointment_id', appointmentIds)
        .order('created_at', { ascending: false }).limit(8);
      if (error) throw error;
      history = data || [];
      const { count, error: queueError } = await service.from('clinic_google_calendar_sync_jobs')
        .select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId)
        .eq('user_id', access.user.id).in('appointment_id', appointmentIds).eq('status', 'queued');
      if (queueError) throw queueError;
      queued = count || 0;
    }
    return NextResponse.json({ connection, history, queued }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el estado de Google Calendar. Revisa que la migración esté aplicada.' }, { status: 503 });
  }
}
