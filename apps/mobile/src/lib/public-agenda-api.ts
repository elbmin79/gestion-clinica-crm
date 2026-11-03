import { mobileApiBaseUrl, getMobileAccessToken } from '@/lib/clinic-access-api';

export type PublicAgendaReadiness = { configured: boolean; secretConfigured: boolean; databaseConfigured: boolean };

export async function loadPublicAgendaReadiness(clinicId: string): Promise<PublicAgendaReadiness> {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para revisar si las solicitudes públicas están habilitadas.');
  const token = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/public-agenda-status`);
  url.searchParams.set('clinicId', clinicId);
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as PublicAgendaReadiness & { error?: string };
  if (!response.ok) throw new Error(data.error || 'No se pudo revisar la configuración del servidor.');
  return data;
}
