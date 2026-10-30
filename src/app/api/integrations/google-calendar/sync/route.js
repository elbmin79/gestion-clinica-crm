import { NextResponse } from 'next/server';
import { getGoogleServiceClient, requireClinicAccess, requireProviderCalendarAccess, runGoogleCalendarSync } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const clinicId = typeof body?.clinicId === 'string' ? body.clinicId.trim() : '';
  const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
  const initial = body?.initial === true;
  if (!clinicId || (initial && !providerId)) return NextResponse.json({ error: 'Falta la clínica o el profesional vinculado a tu cuenta.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, providerId ? ['admin', 'clinician'] : ['admin', 'clinician', 'receptionist']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const service = getGoogleServiceClient();
    if (providerId) {
      const providerAccess = await requireProviderCalendarAccess(service, {
        clinicId, providerId, userId: access.user.id, role: access.role,
      });
      if (providerAccess.error) return NextResponse.json({ error: providerAccess.error }, { status: providerAccess.status });
    }
    if (initial && providerId) {
      const { error } = await service.rpc('queue_google_calendar_provider_initial_sync', {
        target_clinic_id: clinicId,
        target_provider_id: providerId,
      });
      if (error) throw new Error('No se pudo preparar la primera sincronización. Aplica la migración de Google Calendar.');
    }
    const result = await runGoogleCalendarSync(service, { clinicId, providerId: providerId || null, limit: initial ? 20 : 8 });
    let queueQuery = service
      .from('clinic_google_calendar_sync_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'queued');
    if (providerId) queueQuery = queueQuery.eq('target_provider_id', providerId);
    const { count, error: queueError } = await queueQuery;
    if (queueError) throw queueError;
    return NextResponse.json({ ok: true, ...result, queued: count || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo sincronizar con Google Calendar.' }, { status: 503 });
  }
}
