import { createHmac, timingSafeEqual } from 'node:crypto';

export function validWhatsAppSignature(rawBody, signature, appSecret) {
  if (!rawBody || !signature?.startsWith('sha256=') || !appSecret) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function actionFromWhatsAppMessage(message) {
  const raw = message?.interactive?.button_reply?.id
    || message?.button?.payload
    || message?.text?.body;
  const value = String(raw || '').trim().toLocaleLowerCase('es-MX')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (['confirm', 'confirmar', 'confirmo', 'si', 'si confirmo', 'confirmo mi cita'].includes(value)) return 'confirm';
  if (['cancel', 'cancelar', 'cancelo', 'cancelo mi cita'].includes(value)) return 'cancel';
  if (['reschedule', 'reagendar', 'reagendo', 'cambiar cita', 'reprogramar cita'].includes(value)
    || /^(?:(?:quiero|necesito|quisiera|puedo)\s+)?(?:reagendar|reprogramar)(?:\s+(?:mi|la)\s+cita)?(?:\s+por favor)?$/.test(value)) return 'reschedule';
  return '';
}

export function confirmationMessages(payload) {
  return (payload?.entry || []).flatMap(entry => entry.changes || [])
    .flatMap(change => change.value?.messages || []);
}

export function confirmationEvents(payload) {
  if (!payload || !Array.isArray(payload.entry)) return [];
  const events = [];
  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      const phoneNumberId = typeof value?.metadata?.phone_number_id === 'string' ? value.metadata.phone_number_id : '';
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        events.push({ phoneNumberId, message });
      }
    }
  }
  return events;
}

export function confirmationReplyForMessage(message) {
  const action = actionFromWhatsAppMessage(message);
  if (!action || !message?.id || !message?.from) return null;
  return {
    contextMessageId: message?.context?.id || null,
    inboundMessageId: message.id,
    from: message.from,
    action,
  };
}
