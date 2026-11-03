import { createClient } from '@/lib/supabase';
import { mobileApiBaseUrl } from '@/lib/clinic-access-api';

export type GoogleCalendarConnection = {
  google_email: string;
  calendar_id: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};
export type GoogleCalendarItem = { id: string; summary: string; primary: boolean; accessRole: string; timeZone: string };
export type GoogleCalendarHistoryItem = { status: string; attempts: number; last_error: string | null; created_at: string; updated_at: string; completed_at: string | null };
export type GoogleCalendarStatus = { connection: GoogleCalendarConnection | null; history: GoogleCalendarHistoryItem[]; queued: number };

async function accessToken() {
  const client = createClient();
  if (!client) throw new Error('La conexión con Supabase no está configurada.');
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Inicia sesión de nuevo para administrar Google Calendar.');
  let session = data.session;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
    session = refreshed.data.session;
  }
  return session.access_token;
}

export async function googleCalendarRequest<T>(clinicId: string, method: 'GET' | 'POST', payload?: Record<string, unknown>, action?: string): Promise<T> {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await accessToken();
  const url = new URL(`${baseUrl}/api/mobile/google-calendar`);
  url.searchParams.set('clinicId', clinicId);
  if (action) url.searchParams.set('action', action);
  const response = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ clinicId, ...payload }) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la acción de Google Calendar.');
  return result;
}
