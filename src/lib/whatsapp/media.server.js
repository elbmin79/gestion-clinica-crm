import 'server-only';
import { Buffer } from 'node:buffer';

export const WHATSAPP_MEDIA_BUCKET = 'clinic-whatsapp-media';
export const WHATSAPP_MEDIA_TYPES = Object.freeze({
  'image/jpeg': { extension: 'jpg', kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'image/png': { extension: 'png', kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', kind: 'video', maxBytes: 16 * 1024 * 1024 },
});

export function getWhatsAppMediaType(contentType) {
  return WHATSAPP_MEDIA_TYPES[String(contentType || '').split(';')[0].trim().toLowerCase()] || null;
}

export function hasWhatsAppMediaSignature(bytes, contentType) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  switch (contentType) {
    case 'image/jpeg': return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/png': return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'video/mp4': return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp';
    default: return false;
  }
}

export async function downloadTwilioWhatsAppMedia({ mediaUrl, contentType, accountSid, authToken, messageSid, fetchImpl = globalThis.fetch }) {
  const normalizedContentType = String(contentType || '').split(';')[0].trim().toLowerCase();
  const type = getWhatsAppMediaType(normalizedContentType);
  if (!type) throw new Error('WhatsApp sent an unsupported media type.');
  let url;
  try { url = new URL(mediaUrl); } catch { throw new Error('Twilio media URL is invalid.'); }
  const expectedPath = new RegExp(`^/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/ME[0-9a-fA-F]{32}(?:\\.json)?$`);
  if (url.protocol !== 'https:' || url.hostname !== 'api.twilio.com' || url.port || !expectedPath.test(url.pathname)) {
    throw new Error('Twilio media URL is not a trusted resource.');
  }
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetchImpl(url, {
    headers: { Authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Twilio media download failed.');
  const responseType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (responseType && responseType !== 'application/octet-stream' && responseType !== normalizedContentType) {
    throw new Error('Twilio media type did not match its webhook metadata.');
  }
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > type.maxBytes) throw new Error('WhatsApp media exceeds its size limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > type.maxBytes || !hasWhatsAppMediaSignature(bytes, normalizedContentType)) {
    throw new Error('WhatsApp media content is invalid or exceeds its size limit.');
  }
  return { bytes, contentType: normalizedContentType, extension: type.extension, size: bytes.length, kind: type.kind };
}

export function isWhatsAppMediaPath(path, clinicId, conversationId) {
  const prefix = `${clinicId}/${conversationId}/`;
  return typeof path === 'string'
    && path.startsWith(prefix)
    && /^[0-9a-f-]{36}\.(?:jpg|png|webp|mp4)$/i.test(path.slice(prefix.length));
}
