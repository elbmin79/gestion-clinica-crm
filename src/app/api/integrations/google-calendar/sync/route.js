import { NextResponse } from 'next/server';
import { getGoogleServiceClient, getUserGoogleCalendarConnection, requireClinicAccess, runGoogleCalendarSync } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  const initial = body?.initial === true;
  if (!clinicId) return NextResponse.json({ error: 'Indica la clínica para sincronizar.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician', 'receptionist', 'billing']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const service = getGoogleServiceClient();
    const connection = await getUserGoogleCalendarConnection(service, clinicId, access.user.id);
    if (!connection) return NextResponse.json({ error: 'Conecta primero tu cuenta de Google Calendar.' }, { status: 409 });
    if (initial) {
      const { error } = await service.rpc('queue_google_calendar_user_initial_sync', {
        target_clinic_id: clinicId,
        target_user_id: access.user.id,
      });
      if (error) throw new Error('No se pudieron preparar las próximas citas para sincronizarlas.');
    }
    const result = await runGoogleCalendarSync(service, { clinicId, userId: access.user.id, limit: initial ? 20 : 25 });
    const { count, error } = await service.from('clinic_google_calendar_sync_jobs')
      .select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId)
      .eq('user_id', access.user.id).eq('status', 'queued');
    if (error) throw error;
    return NextResponse.json({ ok: true, ...result, queued: count || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo sincronizar con Google Calendar.' }, { status: 503 });
  }
}
