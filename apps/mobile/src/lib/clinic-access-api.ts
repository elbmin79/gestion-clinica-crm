import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { createClient } from '@/lib/supabase';

export type ClinicAccessRole = 'admin' | 'clinician' | 'receptionist' | 'billing';
export type ClinicAccessPermissions = Record<string, boolean | 'self' | 'branch' | 'clinic'>;

export type ClinicAccessMember = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: ClinicAccessRole;
  permissions: ClinicAccessPermissions;
};

export type ClinicAccessAccount = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  confirmed: boolean;
};

export type ClinicInvitation = {
  id: string;
  email: string;
  role: ClinicAccessRole;
  permissions: ClinicAccessPermissions;
  status: 'pending';
  delivery_status: string;
  expires_at: string;
  last_sent_at: string | null;
};

export type ClinicAccessData = {
  members: ClinicAccessMember[];
  accounts: ClinicAccessAccount[];
  currentUserId: string;
  invitations: ClinicInvitation[];
};

export function mobileApiBaseUrl() {
  const configured = (
    process.env.EXPO_PUBLIC_CRM_API_URL
    || Constants.expoConfig?.extra?.crmApiUrl
    || 'https://gestion-clinica-crm.vercel.app'
  ).trim();
  return configured.replace(/\/+$/, '');
}

export async function getMobileAccessToken() {
  const client = createClient();
  if (!client) throw new Error('La conexión con Supabase no está configurada.');
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('No se pudo verificar tu sesión. Inicia sesión de nuevo.');
  let session = data.session;
  if (!session) throw new Error('Inicia sesión para administrar accesos.');
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
    session = refreshed.data.session;
  }
  return session.access_token;
}

export async function clinicAccessRequest<T>(clinicId: string, payload?: Record<string, unknown>): Promise<T> {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/clinic-access`);
  if (!payload) url.searchParams.set('clinicId', clinicId);
  const response = await fetch(url.toString(), {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ clinicId, ...payload }) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(result.message || result.error || 'No se pudo completar la solicitud.');
  return result;
}
