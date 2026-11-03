export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppReplyWindowOpen(lastInboundAt, now = Date.now()) {
  const inboundAt = Date.parse(lastInboundAt || '');
  const age = now - inboundAt;
  return Number.isFinite(inboundAt) && age >= 0 && age < WHATSAPP_REPLY_WINDOW_MS;
}
