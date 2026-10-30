import { NextResponse } from 'next/server';
import { getGoogleServiceClient, requireClinicAccess, runGoogleCalendarSync } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  const initial = body?.initial === true;
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, initial ? ['admin'] : ['admin', 'clinician', 'receptionist']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const service = getGoogleServiceClient();
    if (initial) {
      const { error } = await service.rpc('queue_google_calendar_initial_sync', { target_clinic_id: clinicId });
      if (error) throw new Error('No se pudo preparar la primera sincronización. Aplica la migración de Google Calendar.');
    }
    const result = await runGoogleCalendarSync(service, { clinicId, limit: initial ? 20 : 8 });
    const { count, error: queueError } = await service
      .from('clinic_google_calendar_sync_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'queued');
    if (queueError) throw queueError;
    return NextResponse.json({ ok: true, ...result, queued: count || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo sincronizar con Google Calendar.' }, { status: 503 });
  }
}
