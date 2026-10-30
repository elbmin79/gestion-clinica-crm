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
      .order('name');
    if (providerError) throw providerError;
    const visibleProviders = (providerRows || []).filter(provider =>
      access.role === 'admin' || provider.user_id === access.user.id);
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
    let clinicConnection = null;
    if (access.role === 'admin') {
      const { data, error } = await service
        .from('clinic_google_calendar_connections')
        .select('google_email, calendar_id, connected_at, last_synced_at, last_sync_status, last_sync_error')
        .eq('clinic_id', clinicId)
        .maybeSingle();
      if (error) throw error;
      clinicConnection = data || null;
    }
    let history = [];
    let queued = 0;
    if (access.role === 'admin') {
      const { data, error: historyError } = await service
        .from('clinic_google_calendar_sync_jobs')
        .select('status, attempts, last_error, created_at, updated_at, completed_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(8);
      if (historyError) throw historyError;
      history = data || [];
      const { count, error: queueError } = await service
        .from('clinic_google_calendar_sync_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'queued');
      if (queueError) throw queueError;
      queued = count || 0;
    }
    const connectionByProvider = new Map(providerConnections.map(connection => [connection.provider_id, connection]));
    const providers = visibleProviders.map(provider => ({
      id: provider.id,
      name: provider.name,
      active: provider.active,
      connection: connectionByProvider.get(provider.id) || null,
    }));
    return NextResponse.json({
      connected: Boolean(clinicConnection || providerConnections.length),
      clinicConnection,
      providers,
      history,
      queued,
      canManageClinicConnection: access.role === 'admin',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el estado de Google Calendar. Revisa que la migración esté aplicada.' }, { status: 503 });
  }
}
