import { getMobileAccessToken, mobileApiBaseUrl } from '@/lib/clinic-access-api';

export type MobileClinicInvitation = {
  id: string;
  email: string;
  role: string;
  requiresPassword: boolean;
  expiresAt: string;
};

async function request<T>(id: string, method: 'GET' | 'POST'): Promise<T> {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/clinic-invitation`);
  const options: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ id }) } : {}),
    cache: 'no-store',
  };
  if (method === 'GET') url.searchParams.set('id', id);
  const response = await fetch(url.toString(), options);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'No se pudo verificar la invitación.');
  return body;
}

export function loadMobileClinicInvitation(id: string) {
  return request<{ invitation: MobileClinicInvitation } | { accepted: true; clinicId: string }>(id, 'GET');
}

export function acceptMobileClinicInvitation(id: string) {
  return request<{ ok: true; clinicId: string }>(id, 'POST');
}
