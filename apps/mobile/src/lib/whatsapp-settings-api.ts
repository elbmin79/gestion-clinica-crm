import { getMobileAccessToken, mobileApiBaseUrl } from '@/lib/clinic-access-api';

export type WhatsAppSettings = { notifyWhatsAppMessages: boolean; notifyWhatsAppConfirmations: boolean; providerMode: 'twilio' };
export type WhatsAppSender = { senderKey: string; whatsappNumber: string; displayLabel: string; branchIds: string[]; active: boolean };
export type WhatsAppSettingsWorkspace = {
  settings: { ok: true; settings: WhatsAppSettings; senders: WhatsAppSender[]; configured: boolean };
  branches: { id: string; name: string }[];
  availableSenders: { phoneNumber: string; displayLabel: string }[];
  inboxSender: { phoneNumber: string; displayLabel: string } | null;
  senderLookupError: string;
  canManage: boolean;
};

async function request<T>(clinicId: string, payload?: Record<string, unknown>) {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/whatsapp-settings`);
  if (!payload) url.searchParams.set('clinicId', clinicId);
  const response = await fetch(url.toString(), {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ clinicId, ...payload }) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'No se pudo cargar la configuración de WhatsApp.');
  return result;
}

export function loadWhatsAppSettings(clinicId: string) {
  return request<WhatsAppSettingsWorkspace>(clinicId);
}

export function saveWhatsAppSettings(clinicId: string, settings: WhatsAppSettings, senders: WhatsAppSender[]) {
  return request<{ ok: true; settings: WhatsAppSettings; senders: WhatsAppSender[]; message: string }>(clinicId, {
    ...settings, senders,
  });
}
