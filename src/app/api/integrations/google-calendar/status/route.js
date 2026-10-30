import { NextResponse } from 'next/server';
import { getGoogleServiceClient, requireClinicAccess } from '../../../../../lib/google-calendar.server.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const clinicId = request.nextUrl.searchParams.get('clinicId')?.trim();
  if (!clinicId) return NextResponse.json({ error: 'Falta la clínica.' }, { status: 400 });
  const access = await requireClinicAccess(clinicId, ['admin', 'clinician']);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const service = getGoogleServiceClient();
    const { data: providerRows, error: providerError } = await service
      .from('clinic_providers')
      .select('id, name, user_id, active')
      .eq('clinic_id', clinicId)
      .eq('user_id', access.user.id)
      .order('name');
    if (providerError) throw providerError;
    const visibleProviders = providerRows || [];
    const providerIds = visibleProviders.map(provider => provider.id);
    let providerConnections = [];
    if (providerIds.length) {
      const { data, error } = await service
        .from('clinic_provider_google_calendar_connections')
        .select('provider_id, google_email, calendar_id, connected_at, last_synced_at, last_sync_status, last_sync_error')
        .eq('clinic_id', clinicId)
        .in('provider_id', providerIds);
      if (error) throw error;
      providerConnections = data || [];
    }
    let history = [];
    let queued = 0;
    if (providerIds.length) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: appointments, error: appointmentError } = await service
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .in('provider_id', providerIds)
        .gte('starts_at', since);
      if (appointmentError) throw appointmentError;
      const appointmentIds = (appointments || []).map(appointment => appointment.id);
      if (appointmentIds.length) {
        const { data, error: historyError } = await service
          .from('clinic_google_calendar_sync_jobs')
          .select('status, attempts, last_error, created_at, updated_at, completed_at')
          .eq('clinic_id', clinicId)
          .in('appointment_id', appointmentIds)
          .order('created_at', { ascending: false })
          .limit(8);
        if (historyError) throw historyError;
        history = data || [];
        const { count, error: queueError } = await service
          .from('clinic_google_calendar_sync_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinicId)
          .in('appointment_id', appointmentIds)
          .eq('status', 'queued');
        if (queueError) throw queueError;
        queued = count || 0;
      }
    }
    const connectionByProvider = new Map(providerConnections.map(connection => [connection.provider_id, connection]));
    const providers = visibleProviders.map(provider => ({
      id: provider.id,
      name: provider.name,
      active: provider.active,
      connection: connectionByProvider.get(provider.id) || null,
    }));
    return NextResponse.json({
      connected: Boolean(providerConnections.length),
      providers,
      history,
      queued,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el estado de Google Calendar. Revisa que la migración esté aplicada.' }, { status: 503 });
  }
}
