import { getMobileAccessToken, mobileApiBaseUrl } from '@/lib/clinic-access-api';
import { File as ExpoFile } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { createClient } from '@/lib/supabase';

export type WhatsAppConversation = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  sender_phone: string;
  last_inbound_at: string | null;
  last_message_at: string;
  blocked_at: string | null;
  latest_message: { body: string; direction: 'inbound' | 'outbound'; media_content_type: string | null; created_at: string } | { body: string; direction: 'inbound' | 'outbound'; media_content_type: string | null; created_at: string }[] | null;
};

export type WhatsAppMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  delivery_status: string;
  delivery_error_code: string | null;
  delivery_error_message: string | null;
  created_at: string;
  media_content_type: string | null;
  media_filename: string | null;
  media_size_bytes: number | null;
  media_available: boolean;
};

export type WhatsAppInboxData = { conversations: WhatsAppConversation[]; messages: WhatsAppMessage[] };

export async function loadWhatsAppInbox(clinicId: string, conversationId = '') {
  return request<WhatsAppInboxData>(clinicId, conversationId ? { conversationId } : undefined);
}

export async function loadWhatsAppMediaUrl(clinicId: string, conversationId: string, mediaMessageId: string) {
  return request<{ url: string; contentType: string }>(clinicId, { conversationId, mediaMessageId });
}

export async function sendWhatsAppText(clinicId: string, conversationId: string, body: string) {
  return request<{ ok: true }>(clinicId, undefined, { action: 'send-text', conversationId, body });
}

export async function setWhatsAppConversationBlocked(clinicId: string, conversationId: string, blocked: boolean) {
  return request<{ ok: true; blockedAt: string | null }>(clinicId, undefined, {
    action: blocked ? 'block' : 'unblock', conversationId,
  });
}

export async function deleteWhatsAppConversation(clinicId: string, conversationId: string) {
  return request<{ ok: true }>(clinicId, undefined, { action: 'delete-conversation', conversationId });
}

export async function sendWhatsAppAttachment(clinicId: string, conversationId: string, body: string, asset: DocumentPickerAsset) {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await getMobileAccessToken();
  const storage = createClient();
  if (!storage) throw new Error('Configura la conexión de Supabase en la app móvil.');
  const source = asset.file || new ExpoFile(asset.uri);
  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength) throw new Error('El archivo está vacío. Selecciona otro archivo.');
  const contentType = resolveAttachmentType(asset.mimeType || asset.file?.type || source.type || '', asset.name);
  const upload = await fetch(`${baseUrl}/api/mobile/whatsapp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicId, action: 'prepare-media-upload', conversationId, contentType, size: bytes.byteLength }),
    cache: 'no-store',
  });
  const prepared = await upload.json().catch(() => ({})) as { path?: string; token?: string; error?: string };
  if (!upload.ok || !prepared.path || !prepared.token) throw new Error(prepared.error || 'No se pudo preparar el archivo.');

  const { error: storageError } = await storage.storage.from('clinic-whatsapp-media').uploadToSignedUrl(
    prepared.path,
    prepared.token,
    new Blob([bytes], { type: contentType }),
    { contentType, upsert: false },
  );
  if (storageError) throw new Error('No se pudo subir el archivo. Comprueba tu conexión e inténtalo de nuevo.');

  const response = await fetch(`${baseUrl}/api/whatsapp/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicId, conversationId, body, mediaPath: prepared.path, mediaFilename: asset.name }),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo enviar el archivo.');
}

function resolveAttachmentType(type: string, filename: string) {
  const normalized = type.split(';')[0].trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'video/mp4', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/3gpp'].includes(normalized)) return normalized;
  const extension = filename.split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', '3gp': 'audio/3gpp' } as Record<string, string>)[extension || ''] || 'application/octet-stream';
}

async function request<T>(clinicId: string, query?: { conversationId?: string; mediaMessageId?: string }, payload?: Record<string, string>) {
  const baseUrl = mobileApiBaseUrl();
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_CRM_API_URL para conectar con el CRM.');
  const token = await getMobileAccessToken();
  const url = new URL(`${baseUrl}/api/mobile/whatsapp`);
  url.searchParams.set('clinicId', clinicId);
  if (query?.conversationId) url.searchParams.set('conversationId', query.conversationId);
  if (query?.mediaMessageId) url.searchParams.set('mediaMessageId', query.mediaMessageId);
  const response = await fetch(url.toString(), {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ clinicId, ...payload }) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud de WhatsApp.');
  return result;
}
